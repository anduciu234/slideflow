/**
 * MCP server Claude Code uses to drive the pipeline. stdout is the MCP channel —
 * log only with console.error.
 */
import fs from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PATHS } from "./config.js";
import { getDraft, listDrafts, saveDraft } from "./drafts.js";
import { cancel, enqueue, loadQueue, publish, refreshStatuses } from "./queue.js";
import { getPost, listResearch, research, summarize, type Source } from "./research/index.js";
import { spendSummary } from "./research/spend.js";
import { contactSheet, remixPlan } from "./remix.js";
import { saveImages } from "./images.js";
import { listFormats, saveFormat } from "./formats.js";
import { getStats, syncStats } from "./stats.js";
import { fillSlots, loadPlan, setAccountPlan, setApproved, upcomingSlots } from "./autopilot.js";
import { APP_QUESTIONS, getApp, listApps, saveApp } from "./apps.js";
import { autofillApp } from "./appstore.js";
import { scores } from "./research/normalize.js";
import { loadAccounts, accessToken } from "./tiktok/auth.js";
import { creatorInfo } from "./tiktok/api.js";

const server = new McpServer({ name: "slideflow", version: "0.1.0" });

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] });
const wrap =
  <A,>(fn: (a: A) => Promise<unknown> | unknown) =>
  async (a: A) => {
    try {
      return ok(await fn(a));
    } catch (e) {
      return { ...ok(`Error: ${(e as Error).message}`), isError: true };
    }
  };

const source = z.enum(["auto", "lurk", "apify", "browser"]).default("auto").describe("auto = cheap photo-only Apify actor (lurk), falling back to clockworks if blocked; browser if no token");

server.registerTool(
  "research_slideshows",
  {
    description:
      "Find TikTok photo slideshows by account, hashtag or search term. Saves each post + downloaded slide JPGs to library/research/<id>/. Returns engagement stats and local image paths — open the images with Read to study them.",
    inputSchema: {
      profiles: z.array(z.string()).optional().describe("usernames, with or without @"),
      hashtags: z.array(z.string()).optional(),
      search: z.string().optional().describe("keyword search (sorted by most liked)"),
      limit: z.number().int().min(1).max(100).default(20),
      profileSorting: z.enum(["latest", "popular", "oldest"]).default("popular").describe("clockworks source only"),
      searchDateFilter: z
        .enum(["ALL_TIME", "PAST_24_HOURS", "PAST_WEEK", "PAST_MONTH", "LAST_3_MONTHS", "LAST_6_MONTHS"])
        .optional()
        .describe("clockworks search only: restrict to recent posts"),
      comments: z.number().int().min(0).max(50).default(0).describe("top comments per slideshow ($0.0003 each on the default source). Use only on focused runs."),
      refresh: z.boolean().default(false).describe("ignore the cache (posts ≤7 days, identical queries ≤3 days are free re-reads)"),
      source,
    },
  },
  wrap(async (a: Parameters<typeof research>[0] & { source: Source }) => {
    const posts = await research(a, a.source);
    if (!posts.length) return "No slideshows found. Try another query, source:'apify', or `npm run research:login` for the browser scraper.";
    return posts.map(summarize);
  }),
);

server.registerTool(
  "get_slideshow",
  {
    description: "Fetch one TikTok slideshow by URL, including its top 40 comments. Comments reveal what the audience wants more of.",
    inputSchema: { url: z.string().url(), source },
  },
  wrap(async (a: { url: string; source: Source }) => {
    const p = await getPost(a.url, a.source);
    return p ? summarize(p) : "Could not read that post (not a photo slideshow, removed, or blocked).";
  }),
);

server.registerTool(
  "list_research",
  {
    description: "List slideshows already researched, ranked. Use to pick the strongest examples to model.",
    inputSchema: {
      sortBy: z.enum(["views", "likeRate", "saveRate", "shareRate", "commentRate"]).default("views"),
      author: z.string().optional(),
      limit: z.number().int().default(30),
    },
  },
  wrap((a: { sortBy: "views" | "likeRate" | "saveRate" | "shareRate" | "commentRate"; author?: string; limit: number }) =>
    listResearch()
      .filter((p) => !a.author || p.author.toLowerCase() === a.author.replace(/^@/, "").toLowerCase())
      .sort((x, y) => scores(y.stats)[a.sortBy] - scores(x.stats)[a.sortBy])
      .slice(0, a.limit)
      .map(summarize),
  ),
);

server.registerTool(
  "save_pattern",
  {
    description:
      "Save a reusable slideshow pattern (hook formula, slide count, structure, text style/position, photo style, CTA, why it works, source post ids) as markdown in library/patterns/<name>.md.",
    inputSchema: { name: z.string().regex(/^[a-z0-9-]+$/), markdown: z.string() },
  },
  wrap((a: { name: string; markdown: string }) => {
    const f = path.join(PATHS.patterns, `${a.name}.md`);
    fs.writeFileSync(f, a.markdown);
    return `Saved ${f}`;
  }),
);

const textStyle = z
  .enum(["classic", "outline", "plain", "box", "translucent", "sticker", "none"])
  .describe("classic = TikTok default: white, thin dark outline, medium weight (most phone-photo slideshows); outline = white + thick black stroke; plain = white + shadow; box = per-line rounded bg (default white bg/black text); translucent = per-line dark see-through bg; sticker = one solid rotated label; none = plain coloured text (designed slides)");
const textLayer = z.object({
  type: z.literal("text"),
  text: z.string().describe("\\n for line breaks, **word** to highlight"),
  x: z.number().min(0).max(100).optional().describe("centre, % of width (default 50)"),
  y: z.number().min(0).max(100).describe("centre, % of height"),
  width: z.number().min(5).max(100).optional().describe("% of width (default 84)"),
  style: textStyle.optional(),
  font: z.enum(["classic", "tiktok", "typewriter", "handwriting", "serif", "rounded", "condensed"]).optional().describe("classic = TikTok Classic look-alike (default, most viral slideshows); tiktok = TikTok Sans (newer TikTok look)"),
  letterSpacing: z.number().optional().describe("em; default -0.03 for classic"),
  size: z.number().optional().describe("px at 1080 wide (default 60; small notes ~34, headlines 80–110)"),
  weight: z.number().optional(),
  color: z.string().optional(),
  bg: z.string().optional().describe("box/sticker/translucent background colour"),
  accent: z.string().optional().describe("colour of **highlighted** words"),
  align: z.enum(["center", "left", "right"]).optional(),
  rotate: z.number().optional().describe("degrees, e.g. -6 for a tilted sticker"),
  uppercase: z.boolean().optional(),
  lineHeight: z.number().optional(),
});
const imageLayer = z.object({
  type: z.literal("image"),
  src: z.string().describe("assets file, absolute path or https URL (screenshot, logo, product shot)"),
  x: z.number().optional(),
  y: z.number().describe("centre, % of height"),
  width: z.number().describe("% of slide width"),
  radius: z.number().optional(),
  rotate: z.number().optional(),
  shadow: z.boolean().optional(),
  border: z.string().optional(),
});
const slide = z.object({
  image: z.string().describe('background: file in library/assets, absolute path, https URL, or "color:<css background>"'),
  fit: z.enum(["cover", "contain"]).optional().describe("contain = show whole image (screenshots) over a blurred copy"),
  dim: z.number().min(0).max(1).optional().describe("darken background 0–1"),
  layers: z.array(z.discriminatedUnion("type", [textLayer, imageLayer])).optional().describe("text blocks, stickers and images drawn in order. Copy the original's positions/styles."),
  text: z.string().optional().describe("legacy shorthand for one text block; prefer layers"),
  position: z.number().min(0).max(100).optional(),
  style: textStyle.optional(),
  fontSize: z.number().optional(),
  align: z.enum(["center", "left"]).optional(),
});

server.registerTool(
  "create_draft",
  {
    description:
      "Render a slideshow (1080x1920 JPGs) and save it as a draft. Pass draftId to revise an existing draft. Returns render paths — ALWAYS open them with Read to check legibility before scheduling.",
    inputSchema: {
      draftId: z.string().optional(),
      title: z.string().max(90).describe("TikTok photo post title (≤90 chars)"),
      caption: z.string().describe("description incl. hashtags (≤4000 chars)"),
      slides: z.array(slide).min(1).max(35),
      aspect: z.enum(["9:16", "3:4"]).optional().describe("3:4 for camera-roll photo formats (most viral photo slideshows), 9:16 for designed slides"),
      look: z.enum(["none", "phone"]).optional().describe("phone = unified camera-roll grade (warmth, grain, vignette) so photos from different sources match"),
      basedOn: z.array(z.string()).optional().describe("research post ids / pattern names this remakes"),
      app: z.string().optional().describe("app slug this draft is for"),
    },
  },
  wrap(async (a: Parameters<typeof saveDraft>[0]) => {
    const d = await saveDraft(a);
    return { draftId: d.id, renders: d.renders };
  }),
);

server.registerTool(
  "contact_sheet",
  {
    description: "Combine a researched post's slides (or a draft's renders) into ONE image so you can study a whole slideshow in a single Read. Pass a research post id or a draft id.",
    inputSchema: { id: z.string() },
  },
  wrap(async (a: { id: string }) => contactSheet(a.id)),
);

server.registerTool(
  "remix_plan",
  {
    description:
      "Start a close remake of a researched slideshow: returns the original's slides (as one contact sheet + individual paths), caption, stats and comments, plus the step-by-step remix checklist. Use before create_draft when copying a format.",
    inputSchema: { postId: z.string() },
  },
  wrap(async (a: { postId: string }) => remixPlan(a.postId)),
);

server.registerTool(
  "save_images",
  {
    description:
      "Download slide images from URLs (Pinterest i.pinimg.com — auto-upgraded to original resolution —, Unsplash, Pexels, ChatGPT) into library/assets/<folder>/NN.jpg. Ask the user before downloading a batch. Returns saved paths (Read them to check) and per-URL errors.",
    inputSchema: {
      urls: z.array(z.string().url()).min(1).max(20),
      folder: z.string().describe("e.g. remix-<postId>"),
      startAt: z.number().int().min(1).default(1).describe("first file number (01.jpg)"),
    },
  },
  wrap(async (a: { urls: string[]; folder: string; startAt: number }) => saveImages(a.urls, a.folder, a.startAt)),
);

server.registerTool(
  "list_formats",
  { description: "The formats library: formats we use (active/testing/idea/retired) with hooks, sources, specs and drafts.", inputSchema: {} },
  wrap(() => listFormats()),
);

server.registerTool(
  "save_format",
  {
    description: "Create or update a format in the library (shown on the dashboard). Call after making a remix so the format, its source and its draft are recorded.",
    inputSchema: {
      slug: z.string().regex(/^[a-z0-9-]+$/),
      name: z.string(),
      status: z.enum(["active", "testing", "idea", "retired"]).optional(),
      hook: z.string().optional(),
      description: z.string().optional(),
      slideCount: z.number().int().optional(),
      sourcePosts: z.array(z.string()).optional(),
      sourceStats: z.string().optional(),
      pattern: z.string().optional(),
      spec: z.string().optional(),
      drafts: z.array(z.string()).optional().describe("draft ids to ADD"),
      notes: z.string().optional(),
    },
  },
  wrap((a: Parameters<typeof saveFormat>[0]) => saveFormat(a)),
);

server.registerTool(
  "sync_account_stats",
  {
    description:
      "Pull fresh TikTok stats for a connected account (profile totals + every post, linked to our drafts/formats). auto = free official API if scopes allow, else profile scrape (~$0.0015/post). Use to learn which of OUR posts/formats work.",
    inputSchema: { account: z.string(), source: z.enum(["auto", "api", "scrape"]).default("auto") },
  },
  wrap(async (a: { account: string; source: "auto" | "api" | "scrape" }) => {
    const s = await syncStats(a.account, a.source);
    return { ...s, posts: s.posts.slice(0, 30) };
  }),
);

server.registerTool(
  "account_stats",
  { description: "Last synced stats for an account (no API cost).", inputSchema: { account: z.string() } },
  wrap((a: { account: string }) => getStats(a.account) ?? "Not synced yet — use sync_account_stats."),
);

server.registerTool(
  "list_apps",
  { description: "Apps we market, each with its TikTok accounts. ALWAYS start by picking the app you're working for.", inputSchema: {} },
  wrap(() => listApps().map((a) => ({ slug: a.slug, name: a.name, oneLiner: a.oneLiner, accounts: a.accounts }))),
);

server.registerTool(
  "get_app",
  { description: "Full profile of an app: what it does, how it works, audience, markets, tone, CTA rules, things to avoid, hashtags, competitors, accounts. Read before writing any slideshow for it.", inputSchema: { slug: z.string() } },
  wrap((a: { slug: string }) => getApp(a.slug) ?? `No app ${a.slug}. Questions to ask the user: ${APP_QUESTIONS.map((q) => q.q).join(" / ")}`),
);

server.registerTool(
  "save_app",
  {
    description: "Create or update an app profile (only fields you pass change). For a new app, interview the user with the onboarding questions or use app_store_autofill first.",
    inputSchema: {
      slug: z.string().optional(),
      name: z.string(),
      appStoreUrl: z.string().optional(),
      website: z.string().optional(),
      oneLiner: z.string().optional(),
      howItWorks: z.string().optional(),
      features: z.array(z.string()).optional(),
      audience: z.string().optional(),
      markets: z.string().optional(),
      tone: z.string().optional(),
      cta: z.string().optional(),
      avoid: z.string().optional(),
      hashtags: z.array(z.string()).optional(),
      competitors: z.array(z.object({ name: z.string(), appStoreUrl: z.string().optional(), tiktok: z.string().optional(), note: z.string().optional() })).optional(),
      accounts: z.array(z.string()).optional().describe("connected TikTok account names for this app"),
    },
  },
  wrap((a: Parameters<typeof saveApp>[0]) => saveApp(a)),
);

server.registerTool(
  "app_store_autofill",
  {
    description: "Fill an app profile from its App Store link (name, description, features, category, rating, icon, screenshots) and suggest competitors. Fields already set are kept unless overwrite is true.",
    inputSchema: { appStoreUrl: z.string().url(), slug: z.string().optional(), overwrite: z.boolean().default(false) },
  },
  wrap((a: { appStoreUrl: string; slug?: string; overwrite: boolean }) => autofillApp(a.appStoreUrl, a.slug, a.overwrite)),
);

server.registerTool(
  "approve_draft",
  { description: "Mark a draft approved (or not) for autopilot. Only do this when the USER approves it.", inputSchema: { draftId: z.string(), approved: z.boolean().default(true) } },
  wrap((a: { draftId: string; approved: boolean }) => setApproved(a.draftId, a.approved)),
);

server.registerTool(
  "set_posting_plan",
  {
    description: "Set an account's autopilot plan: post times (local HH:MM), days, mode, on/off, time zone. Turning autopilot on needs the user's say-so.",
    inputSchema: {
      account: z.string(),
      enabled: z.boolean().optional(),
      times: z.array(z.string()).optional().describe('e.g. ["08:30","18:00"]'),
      days: z.array(z.number().int().min(0).max(6)).optional().describe("0=Sun…6=Sat; omit for every day"),
      mode: z.enum(["draft", "direct"]).optional(),
      requireApproval: z.boolean().optional(),
      timezone: z.string().optional().describe("IANA, e.g. Europe/London"),
    },
  },
  wrap((a: { account: string; timezone?: string } & Record<string, any>) => {
    const { account, timezone, ...plan } = a;
    return setAccountPlan(account, plan, timezone);
  }),
);

server.registerTool(
  "upcoming_schedule",
  { description: "The autopilot calendar: upcoming slots per account and what's in them.", inputSchema: {} },
  wrap(() => {
    const plan = loadPlan();
    return { plan, slots: Object.fromEntries(Object.keys(plan.accounts).map((a) => [a, upcomingSlots(a).map((s) => ({ at: s.at.toISOString(), draftId: s.item?.draftId, status: s.item?.status }))])) };
  }),
);

server.registerTool(
  "fill_schedule",
  { description: "Put approved, unused drafts into empty autopilot slots now (the scheduler also does this every 30 min).", inputSchema: { dryRun: z.boolean().default(false) } },
  wrap((a: { dryRun: boolean }) => fillSlots(new Date(), { dryRun: a.dryRun })),
);

server.registerTool(
  "research_spend",
  { description: "Estimated Apify spend over the last N days (logged per run).", inputSchema: { days: z.number().int().default(30) } },
  wrap((a: { days: number }) => spendSummary(a.days)),
);

server.registerTool(
  "list_drafts",
  { description: "List saved drafts (newest first).", inputSchema: {} },
  wrap(() => listDrafts().map((d) => ({ id: d.id, title: d.title, slides: d.slides.length, renders: d.renders, updatedAt: d.updatedAt }))),
);

server.registerTool(
  "list_accounts",
  { description: "List connected TikTok accounts (connect more with `npm run tiktok:login -- <name>`).", inputSchema: {} },
  wrap(() => Object.values(loadAccounts()).map((a) => ({ name: a.name, displayName: a.displayName, scope: a.scope }))),
);

server.registerTool(
  "account_info",
  { description: "TikTok creator info for an account, including which privacy levels it may post with.", inputSchema: { account: z.string() } },
  wrap(async (a: { account: string }) => creatorInfo(await accessToken(a.account))),
);

const postOpts = {
  draftId: z.string(),
  account: z.string(),
  mode: z
    .enum(["draft", "direct"])
    .default("draft")
    .describe("draft = send to the TikTok app inbox to publish by hand (works before audit). direct = publish to profile (public needs an audited app)."),
  privacy: z.string().optional().describe("direct mode only: PUBLIC_TO_EVERYONE | MUTUAL_FOLLOW_FRIENDS | FOLLOWER_OF_CREATOR | SELF_ONLY"),
  autoMusic: z.boolean().optional(),
};

server.registerTool(
  "schedule_post",
  {
    description: "Queue a draft to post at a time. The scheduler process (`npm run scheduler`) must be running to send it.",
    inputSchema: { ...postOpts, at: z.string().describe("ISO 8601 datetime with timezone offset, e.g. 2026-11-24T18:30:00+01:00") },
  },
  wrap((a: { draftId: string; account: string; mode: "draft" | "direct"; privacy?: string; autoMusic?: boolean; at: string }) =>
    enqueue({ ...a, scheduledAt: a.at }),
  ),
);

server.registerTool(
  "post_now",
  { description: "Upload and send a draft to TikTok immediately.", inputSchema: postOpts },
  wrap(async (a: { draftId: string; account: string; mode: "draft" | "direct"; privacy?: string; autoMusic?: boolean }) => {
    const item = enqueue({ ...a, scheduledAt: new Date().toISOString() });
    return publish(item.id);
  }),
);

server.registerTool(
  "list_queue",
  { description: "Show scheduled/sent posts and refresh TikTok processing status.", inputSchema: {} },
  wrap(async () => {
    await refreshStatuses();
    return loadQueue()
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
      .map((q) => ({ ...q, title: (() => { try { return getDraft(q.draftId).title; } catch { return "?"; } })() }));
  }),
);

server.registerTool(
  "cancel_post",
  { description: "Cancel a queued post.", inputSchema: { id: z.string() } },
  wrap((a: { id: string }) => cancel(a.id)),
);

await server.connect(new StdioServerTransport());
console.error("slideflow MCP ready");

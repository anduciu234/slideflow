/**
 * Free research path: loads ordinary tiktok.com pages in a headless Chromium
 * and captures the JSON the page itself fetches. Fragile by nature (TikTok
 * changes its web app often) and only for low-volume personal research.
 * Search and comments work far better after `npm run research:login`.
 */
import fs from "node:fs";
import { chromium, type BrowserContext, type Page } from "playwright";
import { PATHS } from "../config.js";
import { normalizePost } from "./normalize.js";
import type { ResearchQuery } from "./apify.js";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function openContext(headless = true) {
  const browser = await chromium.launch({ headless });
  const ctx = await browser.newContext({
    userAgent: UA,
    locale: "en-US",
    viewport: { width: 1280, height: 900 },
    storageState: fs.existsSync(PATHS.tiktokSession) ? PATHS.tiktokSession : undefined,
  });
  return { browser, ctx };
}

const LIST_API = /\/api\/(post\/item_list|challenge\/item_list|search\/(general|item|photo)\/full|recommend\/item_list|related\/item_list)/;

function collectItems(page: Page, sink: Map<string, any>) {
  page.on("response", async (r) => {
    if (!LIST_API.test(r.url())) return;
    try {
      const j: any = await r.json();
      const list: any[] = j.itemList ?? j.item_list ?? (Array.isArray(j.data) ? j.data.map((d: any) => d.item ?? d) : []);
      for (const it of list) if (it?.id) sink.set(String(it.id), it);
    } catch {
      /* non-JSON or empty */
    }
  });
}

async function readRehydration(page: Page): Promise<any> {
  const txt = await page
    .locator("script#__UNIVERSAL_DATA_FOR_REHYDRATION__")
    .textContent({ timeout: 5000 })
    .catch(() => null);
  if (!txt) return null;
  try {
    return JSON.parse(txt)?.__DEFAULT_SCOPE__ ?? null;
  } catch {
    return null;
  }
}

export async function browserResearch(q: ResearchQuery) {
  const limit = q.limit ?? 20;
  const targets: string[] = [
    ...(q.profiles ?? []).map((p) => `https://www.tiktok.com/@${p.replace(/^@/, "")}`),
    ...(q.hashtags ?? []).map((h) => `https://www.tiktok.com/tag/${encodeURIComponent(h.replace(/^#/, ""))}`),
    ...(q.search ? [`https://www.tiktok.com/search/photo?q=${encodeURIComponent(q.search)}`] : []),
  ];
  if (q.postUrls?.length) {
    const out = [];
    for (const u of q.postUrls) {
      const p = await browserGetPost(u);
      if (p) out.push(p.post);
    }
    return out;
  }

  const { browser, ctx } = await openContext();
  const items = new Map<string, any>();
  try {
    for (const url of targets) {
      const page = await ctx.newPage();
      collectItems(page, items);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(3000);
      let last = -1;
      for (let i = 0; i < 12; i++) {
        const slides = [...items.values()].filter((it) => it.imagePost).length;
        if (slides >= limit || items.size === last) break;
        last = items.size;
        await page.mouse.wheel(0, 4000);
        await page.waitForTimeout(1800 + Math.random() * 1200);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }

  return [...items.values()]
    .map((it) => normalizePost(it, "browser"))
    .filter((x): x is NonNullable<typeof x> => !!x)
    .slice(0, limit);
}

/** One post plus its top comments (comments generally need a logged-in session). */
export async function browserGetPost(url: string) {
  const { browser, ctx } = await openContext();
  const comments: { text: string; likes: number }[] = [];
  try {
    const page = await ctx.newPage();
    page.on("response", async (r) => {
      if (!/\/api\/comment\/list/.test(r.url())) return;
      try {
        const j: any = await r.json();
        for (const c of j.comments ?? []) comments.push({ text: c.text, likes: c.digg_count ?? 0 });
      } catch {}
    });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(4000);
    const scope = await readRehydration(page);
    const item = scope?.["webapp.video-detail"]?.itemInfo?.itemStruct;
    // nudge the comment panel open so the comment API fires
    await page.locator('[data-e2e="comment-icon"], [data-e2e="browse-comment-icon"]').first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const post = item ? normalizePost(item, "browser") : null;
    if (!post) return null;
    comments.sort((a, b) => b.likes - a.likes);
    return { post: { ...post, topComments: comments.slice(0, 40).map((c) => `${c.text} (${c.likes} likes)`) } };
  } finally {
    await browser.close();
  }
}

/** Opens a visible browser so you can log in to TikTok once; saves the session for research. */
export async function interactiveTikTokLogin() {
  const { browser, ctx } = await openContext(false);
  const page = await ctx.newPage();
  await page.goto("https://www.tiktok.com/login");
  console.error("Log in to TikTok in the opened window. This closes automatically once you're logged in.");
  await waitForCookie(ctx, "sessionid", 5 * 60_000);
  await ctx.storageState({ path: PATHS.tiktokSession });
  await browser.close();
  console.error(`Saved research session to ${PATHS.tiktokSession}`);
}

async function waitForCookie(ctx: BrowserContext, name: string, timeoutMs: number) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const cookies = await ctx.cookies("https://www.tiktok.com");
    if (cookies.some((c) => c.name === name && c.value)) return;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("Timed out waiting for TikTok login");
}

/**
 * Local dashboard, organised by app:  App → accounts, formats, schedule, drafts, profile.
 *   npm run dashboard   →  http://localhost:5180   (localhost only)
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { APP_QUESTIONS, getApp, listApps, saveApp } from "../apps.js";
import { autofillApp, suggestCompetitors } from "../appstore.js";
import { fillSlots, loadPlan, setAccountPlan, setApproved, upcomingSlots } from "../autopilot.js";
import { LIB, PATHS, readJson } from "../config.js";
import { getDraft, listDrafts } from "../drafts.js";
import { listFormats } from "../formats.js";
import { cancel, enqueue, loadQueue, publish, refreshStatuses } from "../queue.js";
import { contactSheet } from "../remix.js";
import { spendSummary } from "../research/spend.js";
import { getStats, syncStats } from "../stats.js";
import { creatorInfo } from "../tiktok/api.js";
import { accessToken, loadAccounts, loginAccount } from "../tiktok/auth.js";

const PORT = Number(process.env.DASHBOARD_PORT ?? 5180);
const HTML = path.join(import.meta.dirname, "index.html");
const rel = (p?: string | null) => (p ? path.relative(LIB, p) : null);

const json = (res: http.ServerResponse, data: unknown, status = 200) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};
const body = (req: http.IncomingMessage): Promise<any> =>
  new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      try {
        resolve(b ? JSON.parse(b) : {});
      } catch {
        resolve({});
      }
    });
  });

async function sheet(id: string) {
  const existing = [path.join(PATHS.research, id, "_sheet.jpg"), path.join(PATHS.renders, id, "_sheet.jpg")].find((p) => fs.existsSync(p));
  try {
    return rel(existing ?? (await contactSheet(id)));
  } catch {
    return null;
  }
}

function draftCard(id: string) {
  try {
    const d = getDraft(id);
    return { id, title: d.title, caption: d.caption, slides: d.slides.length, previews: d.renders.slice(0, 3).map(rel), renders: d.renders.map(rel), aspect: d.aspect ?? "9:16", approved: !!d.approvedAt, updatedAt: d.updatedAt };
  } catch {
    return { id, title: "(deleted draft)", caption: "", slides: 0, previews: [], renders: [], aspect: "9:16", approved: false, updatedAt: "" };
  }
}

function appsList() {
  const drafts = listDrafts();
  const queue = loadQueue();
  return listApps().map((a) => ({
    slug: a.slug,
    name: a.name,
    icon: a.icon,
    oneLiner: a.oneLiner,
    accounts: a.accounts,
    drafts: drafts.filter((d) => d.app === a.slug).length,
    upcoming: queue.filter((q) => a.accounts.includes(q.account) && q.status === "queued").length,
  }));
}

async function appView(slug: string) {
  const app = getApp(slug);
  if (!app) throw new Error(`No app ${slug}`);
  const connected = loadAccounts();
  const plan = loadPlan();
  const queue = loadQueue();
  const drafts = listDrafts().filter((d) => d.app === slug);
  const formats = listFormats().filter((f) => f.app === slug);
  return {
    app,
    questions: APP_QUESTIONS,
    connectedAccounts: Object.keys(connected),
    accounts: app.accounts.map((a) => ({ name: a, connected: !!connected[a], stats: getStats(a), plan: plan.accounts[a] ?? null })),
    formats: await Promise.all(
      formats.map(async (f) => ({
        ...f,
        sourceSheet: f.sourcePosts[0] ? await sheet(f.sourcePosts[0]) : null,
        latest: f.drafts.length ? draftCard(f.drafts.at(-1)!) : null,
      })),
    ),
    drafts: drafts.map((d) => ({
      ...draftCard(d.id),
      format: formats.find((f) => f.drafts.includes(d.id))?.slug,
      queue: queue.filter((q) => q.draftId === d.id).map((q) => ({ id: q.id, status: q.status, mode: q.mode, at: q.scheduledAt, account: q.account, tiktok: q.tiktokStatus, error: q.error })),
    })),
    timezone: plan.timezone,
    schedule: Object.fromEntries(
      app.accounts.map((a) => [a, upcomingSlots(a).map((s) => ({ at: s.at.toISOString(), item: s.item ? { id: s.item.id, status: s.item.status, mode: s.item.mode, draft: draftCard(s.item.draftId) } : null }))]),
    ),
    recent: queue
      .filter((q) => app.accounts.includes(q.account) && q.status !== "queued")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 8)
      .map((q) => ({ ...q, draft: draftCard(q.draftId) })),
    spend: spendSummary(30),
  };
}

const IMG: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
      const q = (k: string) => url.searchParams.get(k) ?? "";
      const POST = req.method === "POST";
      switch (url.pathname) {
        case "/":
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          return res.end(fs.readFileSync(HTML));
        case "/api/apps":
          return json(res, { apps: appsList(), spend: spendSummary(30), questions: APP_QUESTIONS });
        case "/api/app":
          if (POST) {
            const b = await body(req);
            return json(res, saveApp(b));
          }
          return json(res, await appView(q("slug")));
        case "/api/appstore":
          if (POST) {
            const b = await body(req);
            return json(res, await autofillApp(b.url, b.slug || undefined, !!b.overwrite));
          }
          break;
        case "/api/competitors": {
          const app = getApp(q("slug"));
          if (!app) return json(res, { error: "no app" }, 404);
          return json(res, await suggestCompetitors(app));
        }
        case "/api/creator":
          return json(res, await creatorInfo(await accessToken(q("account"))));
        case "/api/post":
          if (POST) {
            // TikTok-compliant post: every setting below was chosen explicitly on the post screen.
            const b = await body(req);
            if (!b.consent) return json(res, { error: "You need to confirm before posting" }, 400);
            if (b.mode === "direct" && !b.privacy) return json(res, { error: "Choose who can view this post" }, 400);
            if (b.commercial && !b.brandOrganic && !b.brandedContent) return json(res, { error: "Choose Your brand and/or Branded content" }, 400);
            const item = enqueue({
              draftId: b.draftId,
              account: b.account,
              scheduledAt: b.at || new Date().toISOString(),
              mode: b.mode,
              privacy: b.privacy || undefined,
              title: b.title,
              caption: b.caption,
              disableComment: !b.allowComment,
              brandOrganic: !!(b.commercial && b.brandOrganic),
              brandedContent: !!(b.commercial && b.brandedContent),
            });
            return json(res, b.at ? item : await publish(item.id));
          }
          break;
        case "/api/sync":
          if (POST) return json(res, await syncStats(q("account"), (q("source") || "auto") as "auto"));
          break;
        case "/api/approve":
          if (POST) return json(res, setApproved(q("draft"), q("v") !== "0"));
          break;
        case "/api/plan":
          if (POST) {
            const { account, timezone, ...plan } = await body(req);
            return json(res, setAccountPlan(account, plan, timezone));
          }
          break;
        case "/api/fill":
          if (POST) return json(res, fillSlots());
          break;
        case "/api/connect":
          if (POST) {
            // Opens TikTok's consent page (Login Kit) in the browser and waits for approval.
            const name = q("name").trim();
            if (!/^[\w.-]{1,40}$/.test(name)) return json(res, { error: "Name: letters, numbers, . - _" }, 400);
            const acc = await loginAccount(name);
            const app = getApp(q("app"));
            if (app && !app.accounts.includes(acc.name)) saveApp({ slug: app.slug, name: app.name, accounts: [...app.accounts, acc.name] });
            return json(res, { name: acc.name, displayName: acc.displayName, scope: acc.scope });
          }
          break;
        case "/api/status": {
          // Poll TikTok's publish status so the user sees what happened (Content Sharing Guidelines 5e).
          await refreshStatuses();
          const item = loadQueue().find((x) => x.id === q("id"));
          return item ? json(res, item) : json(res, { error: "not found" }, 404);
        }
        case "/api/cancel":
          if (POST) return json(res, cancel(q("id")));
          break;
        case "/logo.png": {
          const p = path.join(LIB, "..", "brand", "logo-1024.png");
          if (!fs.existsSync(p)) return json(res, { error: "not found" }, 404);
          res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "max-age=86400" });
          return fs.createReadStream(p).pipe(res);
        }
        case "/file": {
          const p = path.resolve(LIB, q("p"));
          const type = IMG[path.extname(p).toLowerCase()];
          if (!p.startsWith(LIB + path.sep) || !type || !fs.existsSync(p)) return json(res, { error: "not found" }, 404);
          res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
          return fs.createReadStream(p).pipe(res);
        }
        case "/img": {
          const u = new URL(q("u"));
          if (!/(^|\.)(tiktokcdn(-[a-z]+)?\.com|mzstatic\.com)$/.test(u.hostname)) return json(res, { error: "host not allowed" }, 400);
          const r = await fetch(u, { headers: { Referer: "https://www.tiktok.com/" } });
          res.writeHead(r.status, { "Content-Type": r.headers.get("content-type") ?? "image/jpeg", "Cache-Control": "max-age=3600" });
          return res.end(Buffer.from(await r.arrayBuffer()));
        }
      }
      json(res, { error: "not found" }, 404);
    } catch (e) {
      json(res, { error: (e as Error).message }, 500);
    }
  })
  .listen(PORT, "127.0.0.1", () => console.log(`Slideflow dashboard → http://localhost:${PORT}`));

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { env, PATHS, readJson, writeJson } from "../config.js";
import type { ResearchedSlideshow } from "../types.js";
import { apifyResearch, type ResearchQuery } from "./apify.js";
import { browserGetPost, browserResearch } from "./browser.js";
import { LurkBlocked, lurkResearch } from "./lurk.js";
import { scores } from "./normalize.js";

/** auto = lurk (cheap, photo-only) → falls back to clockworks ("apify") if TikTok blocks it; browser if no token. */
export type Source = "auto" | "lurk" | "apify" | "browser";
const pick = (s: Source) => (s === "auto" ? (env("APIFY_TOKEN") ? "lurk" : "browser") : s);

const POST_TTL = 7 * 86400_000; // don't re-buy a post fetched in the last 7 days
const QUERY_TTL = 3 * 86400_000; // don't re-run the same profile/hashtag/search within 3 days
const QUERY_CACHE = path.join(PATHS.research, "_queries.json");
type QueryCache = Record<string, { at: number; ids: string[] }>;

const cached = (id: string, needComments: boolean) => {
  const p = readJson<ResearchedSlideshow | null>(path.join(PATHS.research, id, "post.json"), null);
  if (!p || Date.now() - Date.parse(p.fetchedAt) > POST_TTL) return null;
  if (needComments && !p.topComments?.length) return null;
  return p;
};
const idFromUrl = (u: string) => u.match(/(\d{15,})/)?.[1];

async function fetchPosts(q: ResearchQuery, s: ReturnType<typeof pick>) {
  if (s === "browser") return browserResearch(q);
  if (s === "apify") return apifyResearch(q);
  try {
    return await lurkResearch(q);
  } catch (e) {
    if (!(e instanceof LurkBlocked)) throw e;
    console.error(`lurk blocked (${e.message.slice(0, 80)}); falling back to clockworks`);
    return apifyResearch(q);
  }
}

async function downloadImages(post: Omit<ResearchedSlideshow, "localImages" | "fetchedAt">) {
  const dir = path.join(PATHS.research, post.id);
  fs.mkdirSync(dir, { recursive: true });
  const local: string[] = [];
  for (const [i, url] of post.imageUrls.entries()) {
    const file = path.join(dir, `${String(i + 1).padStart(2, "0")}.jpg`);
    if (fs.existsSync(file)) {
      local.push(file);
      continue;
    }
    try {
      // Apify's stored copies (api.apify.com key-value store) need the token; TikTok CDN wants a Referer.
      const token = env("APIFY_TOKEN");
      const headers: Record<string, string> =
        new URL(url).hostname === "api.apify.com" && token
          ? { Authorization: `Bearer ${token}` }
          : { Referer: "https://www.tiktok.com/" };
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(String(res.status));
      const buf = Buffer.from(await res.arrayBuffer());
      // TikTok serves webp/heic/jpeg; normalise to JPG so Claude's Read tool can view it.
      await sharp(buf).rotate().jpeg({ quality: 85 }).toFile(file);
      local.push(file);
    } catch (e) {
      console.error(`image ${i + 1} of ${post.id} failed: ${(e as Error).message}`);
    }
  }
  return local;
}

async function save(post: Omit<ResearchedSlideshow, "localImages" | "fetchedAt">): Promise<ResearchedSlideshow> {
  const file = path.join(PATHS.research, post.id, "post.json");
  const prev = readJson<Partial<ResearchedSlideshow>>(file, {});
  const full: ResearchedSlideshow = {
    ...post,
    topComments: post.topComments ?? prev.topComments,
    localImages: await downloadImages(post),
    fetchedAt: new Date().toISOString(),
  };
  writeJson(file, full);
  return full;
}

export function summarize(p: ResearchedSlideshow) {
  return {
    id: p.id,
    url: p.url,
    author: p.author,
    caption: p.caption.slice(0, 200),
    createdAt: p.createdAt,
    slides: p.localImages.length,
    ...scores(p.stats),
    likes: p.stats.likes,
    saves: p.stats.saves,
    images: p.localImages,
    ...(p.topComments?.length ? { topComments: p.topComments.slice(0, 15) } : {}),
  };
}

/**
 * Research with caching: posts already fetched (≤7 days) and identical queries (≤3 days)
 * are served from library/research without paying Apify again. Pass refresh to force.
 */
export async function research(q: ResearchQuery & { refresh?: boolean }, source: Source = "auto") {
  const s = pick(source);
  const out: ResearchedSlideshow[] = [];

  // 1. Specific posts: only fetch the ones we don't have.
  if (q.postUrls?.length) {
    const need: string[] = [];
    for (const u of q.postUrls) {
      const id = idFromUrl(u);
      const hit = !q.refresh && id ? cached(id, !!q.comments) : null;
      if (hit) out.push(hit);
      else need.push(u);
    }
    if (need.length) for (const p of await fetchPosts({ ...q, postUrls: need }, s)) out.push(await save(p));
    return out.sort((a, b) => b.stats.views - a.stats.views);
  }

  // 2. Profile / hashtag / search: reuse a recent identical query.
  const key = JSON.stringify({ p: q.profiles, h: q.hashtags, s: q.search, l: q.limit, c: !!q.comments });
  const qc = readJson<QueryCache>(QUERY_CACHE, {});
  const hit = qc[key];
  if (!q.refresh && hit && Date.now() - hit.at < QUERY_TTL) {
    const posts = hit.ids.map((id) => cached(id, false)).filter((p): p is ResearchedSlideshow => !!p);
    if (posts.length === hit.ids.length) {
      console.error(`[cache] reused query from ${new Date(hit.at).toISOString()} (no Apify cost)`);
      return posts.sort((a, b) => b.stats.views - a.stats.views);
    }
  }
  for (const p of await fetchPosts(q, s)) out.push(await save(p));
  qc[key] = { at: Date.now(), ids: out.map((p) => p.id) };
  writeJson(QUERY_CACHE, qc);
  return out.sort((a, b) => b.stats.views - a.stats.views);
}

export async function getPost(url: string, source: Source = "auto") {
  if (pick(source) === "browser") {
    const r = await browserGetPost(url);
    return r ? save(r.post) : null;
  }
  const [p] = await research({ postUrls: [url], comments: 30 }, source);
  return p ?? null;
}

export function listResearch(): ResearchedSlideshow[] {
  if (!fs.existsSync(PATHS.research)) return [];
  return fs
    .readdirSync(PATHS.research)
    .filter((d) => !d.startsWith("_"))
    .map((d) => readJson<ResearchedSlideshow | null>(path.join(PATHS.research, d, "post.json"), null))
    .filter((x): x is ResearchedSlideshow => !!x);
}

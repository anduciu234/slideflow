/**
 * Cheap research path: lurkapi~tiktok-scraper-all-in-one with mediaType "photo".
 * Tested 2026-11-23: a profile run returned 6 slideshows + comments for $0.014,
 * with no videos billed. Keyword search can be soft-blocked by TikTok; callers
 * fall back to the clockworks actor in that case.
 *
 * Prices (FREE tier): $0.0015 per row, $0.0003 per comment, $0.001 actor start.
 */
import { requireEnv } from "../config.js";
import type { ResearchQuery } from "./apify.js";
import { normalizePost } from "./normalize.js";
import { logSpend } from "./spend.js";

const ACTOR = "lurkapi~tiktok-scraper-all-in-one";
export const LURK_PRICE = { row: 0.0015, comment: 0.0003, start: 0.001 };

export class LurkBlocked extends Error {}

export async function lurkResearch(q: ResearchQuery) {
  const limit = q.limit ?? 20;
  const input: Record<string, unknown> = {
    mediaType: "photo",
    maxResults: q.postUrls?.length ? 1 : limit,
    includeComments: !!q.comments,
    // the actor rejects 0 here, so only send it when comments are wanted
    ...(q.comments ? { maxCommentsPerVideo: q.comments } : {}),
    includeSlideshowDownload: false, // images come straight from TikTok's CDN for free
    region: "ALL",
  };
  if (q.profiles?.length) input.profiles = q.profiles.map((p) => p.replace(/^@/, ""));
  if (q.hashtags?.length) input.hashtags = q.hashtags.map((h) => h.replace(/^#/, ""));
  if (q.search) input.keywords = [q.search];
  if (q.postUrls?.length) input.videoUrls = q.postUrls;

  const res = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?timeout=300`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${requireEnv("APIFY_TOKEN")}` },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Apify ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const rows = (await res.json()) as Record<string, any>[];

  const ok = rows.filter((r) => String(r.status).startsWith("Success"));
  const failed = rows.filter((r) => r.error);
  const comments = ok.reduce((n, r) => n + (r.comments?.length ?? 0), 0);
  logSpend({
    actor: ACTOR,
    query: q,
    rows: rows.length,
    comments,
    estUsd: LURK_PRICE.start + rows.length * LURK_PRICE.row + comments * LURK_PRICE.comment,
  });
  if (!ok.length && failed.some((r) => /block/i.test(r.error))) throw new LurkBlocked(failed[0].error);

  // Profile inputs also return one "profile" row with account totals.
  const prof = ok.find((r) => r.type === "profile" || (r.inputType === "profile" && r.followerCount !== undefined));
  const posts = ok
    .filter((r) => r.type === "photo")
    .map((r) => {
      const p = normalizePost(r, "apify");
      if (p && r.comments?.length) {
        p.topComments = [...r.comments]
          .sort((a: any, b: any) => (b.likeCount ?? 0) - (a.likeCount ?? 0))
          .map((c: any) => `${c.text} (${c.likeCount ?? 0} likes)`);
      }
      return p;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const profile = prof
    ? { followers: prof.followerCount, following: prof.followingCount, likes: prof.heartCount, videos: prof.videoCount, avatar: prof.author?.avatar ?? prof.avatar }
    : undefined;
  return Object.assign(posts, { profile });
}

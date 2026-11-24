import { env, requireEnv } from "../config.js";
import { normalizePost } from "./normalize.js";
import { logSpend } from "./spend.js";

export interface ResearchQuery {
  profiles?: string[];
  hashtags?: string[];
  search?: string;
  postUrls?: string[];
  limit?: number;
  /** Profile sort. "popular" = an account's all-time best performers. */
  profileSorting?: "latest" | "popular" | "oldest";
  /** Search only: restrict to recent posts. */
  searchDateFilter?: "ALL_TIME" | "PAST_24_HOURS" | "PAST_WEEK" | "PAST_MONTH" | "LAST_3_MONTHS" | "LAST_6_MONTHS";
  /** Top-level comments to fetch per slideshow (0 = none). Billed per comment. */
  comments?: number;
}

const BASE = "https://api.apify.com/v2";
const auth = () => ({ Authorization: `Bearer ${requireEnv("APIFY_TOKEN")}` });

/**
 * Runs the clockworks~tiktok-scraper actor (pay-per-result) and returns slideshow posts.
 * Input fields verified against the actor's schema on 2026-11-23. There is no
 * "photos only" filter, so profiles of slideshow-heavy accounts are the best source.
 */
export async function apifyResearch(q: ResearchQuery) {
  const actor = env("APIFY_TIKTOK_ACTOR") ?? "clockworks~tiktok-scraper";
  const limit = q.limit ?? 20;

  const input: Record<string, unknown> = {
    // This actor can't filter to photos, so feeds come back mostly videos (search ≈35% slideshows,
    // hashtags ≈0% in the rideshare niche). Fallback only: keep the over-fetch modest.
    resultsPerPage: Math.min(40, Math.max(15, limit * 3)),
    shouldDownloadSlideshowImages: true,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    profileSorting: q.profileSorting ?? "popular",
    excludePinnedPosts: false,
  };
  if (q.profiles?.length) input.profiles = q.profiles.map((p) => p.replace(/^@/, ""));
  if (q.hashtags?.length) input.hashtags = q.hashtags.map((h) => h.replace(/^#/, ""));
  if (q.search) {
    input.searchQueries = [q.search];
    input.searchSection = "/video";
    input.videoSearchSorting = "MOST_LIKED";
    if (q.searchDateFilter) input.videoSearchDateFilter = q.searchDateFilter;
  }
  if (q.postUrls?.length) {
    input.postURLs = q.postUrls;
    input.resultsPerPage = q.postUrls.length;
  }
  if (q.comments) input.topLevelCommentsPerPost = q.comments;

  const res = await fetch(`${BASE}/acts/${actor}/run-sync-get-dataset-items?timeout=300`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth() },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Apify ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const items = (await res.json()) as Record<string, any>[];
  const videos = items.filter((it) => !it.isSlideshow).length;
  // clockworks FREE tier: ~$0.0037/result (measured), ~$0.0013/comment
  logSpend({ actor, query: q, rows: items.length, comments: 0, estUsd: items.length * 0.0037 });

  const out = [];
  for (const it of items) {
    const p = normalizePost(it, "apify");
    if (!p) continue;
    out.push(p);
    if (!q.postUrls?.length && out.length >= limit) break;
  }
  if (!out.length && videos) console.error(`Apify returned ${videos} videos and no slideshows for this query.`);

  // All comments from a run share one dataset; split them by post id.
  const commentsUrl = items.find((it) => it.commentsDatasetUrl)?.commentsDatasetUrl;
  if (q.comments && commentsUrl && out.length) {
    const byPost = await fetchComments(commentsUrl);
    for (const p of out) p.topComments = byPost.get(p.id) ?? [];
  }
  return out;
}

async function fetchComments(datasetUrl: string): Promise<Map<string, string[]>> {
  const byPost = new Map<string, string[]>();
  try {
    const url = new URL(datasetUrl);
    if (!url.pathname.endsWith("/items")) url.pathname = url.pathname.replace(/\/?$/, "/items");
    const rows = (await fetch(url, { headers: auth() }).then((r) => r.json())) as any[];
    rows
      .filter((c) => c?.text && c.videoWebUrl)
      .sort((a, b) => (b.diggCount ?? 0) - (a.diggCount ?? 0))
      .forEach((c) => {
        const postId = String(c.videoWebUrl).match(/(\d{15,})/)?.[1];
        if (!postId) return;
        byPost.set(postId, [...(byPost.get(postId) ?? []), `${c.text} (${c.diggCount ?? 0} likes)`]);
      });
  } catch (e) {
    console.error(`comments fetch failed: ${(e as Error).message}`);
  }
  return byPost;
}

import type { PostStats, ResearchedSlideshow } from "../types.js";

type Any = Record<string, any>;
const num = (...vals: unknown[]) => {
  for (const v of vals) {
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n === "number" && Number.isFinite(n)) return n;
  }
  return 0;
};

/**
 * Accepts either TikTok's own web item shape (itemStruct / itemList entries)
 * or an Apify TikTok-scraper dataset item, and returns a slideshow — or null
 * if the post isn't a photo slideshow.
 */
export function normalizePost(raw: Any, source: "apify" | "browser"): Omit<ResearchedSlideshow, "localImages" | "fetchedAt"> | null {
  if (!raw || typeof raw !== "object") return null;

  // --- image URLs (several known shapes) ---
  let imageUrls: string[] = [];
  const ip = raw.imagePost ?? raw.image_post_info;
  if (ip?.images?.length) {
    imageUrls = ip.images
      .map((im: Any) => im?.imageURL?.urlList?.[0] ?? im?.display_image?.url_list?.[0] ?? im?.url)
      .filter(Boolean);
  }
  if (!imageUrls.length && Array.isArray(raw.slideshowImageLinks)) {
    imageUrls = raw.slideshowImageLinks
      .map((l: Any) => (typeof l === "string" ? l : l?.downloadLink ?? l?.tiktokLink ?? l?.url))
      .filter(Boolean);
  }
  if (!imageUrls.length && Array.isArray(raw.images)) {
    imageUrls = raw.images.map((l: Any) => (typeof l === "string" ? l : l?.url)).filter(Boolean);
  }
  if (!imageUrls.length) return null;

  const id = String(raw.id ?? raw.aweme_id ?? "");
  if (!id) return null;
  // Shapes: TikTok web (author.uniqueId), clockworks (authorMeta.name), lurkapi (authorUsername / author.username)
  const author =
    raw.author?.uniqueId ??
    raw.authorMeta?.name ??
    raw.authorUsername ??
    raw.author?.username ??
    raw.author?.unique_id ??
    (typeof raw.author === "string" ? raw.author : "unknown");

  const s = raw.stats ?? {};
  const s2 = raw.statsV2 ?? {};
  const stats: PostStats = {
    views: num(s2.playCount, s.playCount, raw.playCount, raw.viewCount),
    likes: num(s2.diggCount, s.diggCount, raw.diggCount, raw.likeCount),
    comments: num(s2.commentCount, s.commentCount, raw.commentCount),
    shares: num(s2.shareCount, s.shareCount, raw.shareCount),
    saves: num(s2.collectCount, s.collectCount, raw.collectCount, raw.saveCount),
  };

  const createTime = num(raw.createTime);
  const createdAt = raw.createTimeISO ?? raw.createTimeIso ?? (createTime ? new Date(createTime * 1000).toISOString() : null);

  return {
    id,
    url: raw.webVideoUrl ?? raw.webUrl ?? `https://www.tiktok.com/@${author}/photo/${id}`,
    author,
    caption: raw.desc ?? raw.text ?? raw.title ?? "",
    createdAt,
    stats,
    imageUrls,
    music: raw.music?.title ?? raw.musicMeta?.musicName,
    source,
  };
}

/** Engagement summary Claude can rank by. */
export function scores(s: PostStats) {
  const v = Math.max(s.views, 1);
  return {
    views: s.views,
    likeRate: +(s.likes / v).toFixed(4),
    saveRate: +(s.saves / v).toFixed(4),
    shareRate: +(s.shares / v).toFixed(4),
    commentRate: +(s.comments / v).toFixed(4),
  };
}

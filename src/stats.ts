/**
 * Per-account TikTok stats: profile totals over time + every post's numbers,
 * linked back to our drafts/formats where possible.
 *
 * Sources:
 *  - "api": TikTok Display API (free, official). Needs scopes user.info.stats + video.list
 *           on the app and in TIKTOK_SCOPES, then a fresh `npm run tiktok:login`.
 *  - "scrape": the cheap photo-only Apify actor on the account's public profile
 *           (~$0.0015 per post, includes saves). Works without extra scopes.
 *  - "auto": api, falling back to scrape if the scopes aren't granted.
 */
import path from "node:path";
import { LIB, readJson, writeJson } from "./config.js";
import { listDrafts } from "./drafts.js";
import { listFormats } from "./formats.js";
import { lurkResearch } from "./research/lurk.js";
import { creatorInfo } from "./tiktok/api.js";
import { accessToken, loadAccounts } from "./tiktok/auth.js";

const DIR = path.join(LIB, "stats");

export interface PostStat {
  id: string;
  title: string;
  url: string;
  cover?: string;
  createdAt: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves?: number;
  /** Matched draft/format, when the post came from slideflow. */
  draftId?: string;
  format?: string;
}

export interface AccountStats {
  account: string;
  username?: string;
  displayName?: string;
  avatar?: string;
  syncedAt: string;
  source: "api" | "scrape";
  profile: { followers?: number; following?: number; likes?: number; videos?: number };
  history: { at: string; followers?: number; likes?: number; videos?: number; totalViews: number }[];
  posts: PostStat[];
}

const file = (account: string) => path.join(DIR, `${account}.json`);
export const getStats = (account: string) => readJson<AccountStats | null>(file(account), null);
export const listStats = () => Object.keys(loadAccounts()).map((a) => getStats(a) ?? { account: a, posts: [], history: [], profile: {}, syncedAt: "", source: "api" as const });

async function tiktokGet(token: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || (j.error?.code && j.error.code !== "ok")) {
    const err = new Error(`${j.error?.code ?? res.status}: ${j.error?.message ?? ""}`);
    (err as any).code = j.error?.code;
    throw err;
  }
  return j.data;
}

async function fromApi(account: string) {
  const token = await accessToken(account);
  const u = (
    await tiktokGet(
      token,
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id,username,display_name,avatar_url,follower_count,following_count,likes_count,video_count",
    )
  ).user;
  const posts: PostStat[] = [];
  let cursor: number | undefined;
  for (let page = 0; page < 10; page++) {
    const d = await tiktokGet(
      token,
      "https://open.tiktokapis.com/v2/video/list/?fields=id,title,video_description,create_time,cover_image_url,share_url,view_count,like_count,comment_count,share_count",
      { max_count: 20, ...(cursor ? { cursor } : {}) },
    );
    for (const v of d.videos ?? [])
      posts.push({
        id: String(v.id),
        title: v.title || v.video_description || "",
        url: v.share_url,
        cover: v.cover_image_url,
        createdAt: v.create_time ? new Date(v.create_time * 1000).toISOString() : null,
        views: v.view_count ?? 0,
        likes: v.like_count ?? 0,
        comments: v.comment_count ?? 0,
        shares: v.share_count ?? 0,
      });
    if (!d.has_more) break;
    cursor = d.cursor;
  }
  return {
    source: "api" as const,
    username: u.username,
    displayName: u.display_name,
    avatar: u.avatar_url,
    profile: { followers: u.follower_count, following: u.following_count, likes: u.likes_count, videos: u.video_count },
    posts,
  };
}

async function fromScrape(account: string, username: string) {
  const posts = await lurkResearch({ profiles: [username], limit: 50 });
  return {
    source: "scrape" as const,
    username,
    profile: (posts.profile
      ? { followers: posts.profile.followers, following: posts.profile.following, likes: posts.profile.likes, videos: posts.profile.videos }
      : {}) as AccountStats["profile"],
    posts: posts.map((p) => ({
      id: p.id,
      title: p.caption,
      url: p.url,
      cover: p.imageUrls[0],
      createdAt: p.createdAt,
      views: p.stats.views,
      likes: p.stats.likes,
      comments: p.stats.comments,
      shares: p.stats.shares,
      saves: p.stats.saves,
    })),
  };
}

/** Links posts to our drafts by matching the start of the caption/title. */
function linkDrafts(posts: PostStat[]) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9€$ ]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
  const drafts = listDrafts();
  const formats = listFormats();
  for (const p of posts) {
    const key = norm(p.title);
    if (key.length < 12) continue;
    const d = drafts.find((d) => norm(d.caption) === key || norm(d.title) === key || norm(d.caption).startsWith(key.slice(0, 25)));
    if (d) {
      p.draftId = d.id;
      p.format = formats.find((f) => f.drafts.includes(d.id))?.slug;
    }
  }
}

export async function syncStats(account: string, source: "auto" | "api" | "scrape" = "auto"): Promise<AccountStats> {
  const acc = loadAccounts()[account];
  if (!acc) throw new Error(`No connected account "${account}"`);
  const prev = getStats(account);
  let data: Awaited<ReturnType<typeof fromApi>> | Awaited<ReturnType<typeof fromScrape>>;
  let note = "";
  if (source === "scrape") {
    const info = await creatorInfo(await accessToken(account));
    data = await fromScrape(account, prev?.username ?? info.creator_username);
    Object.assign(data, { displayName: info.creator_nickname, avatar: (info as any).creator_avatar_url });
  }
  else {
    try {
      data = await fromApi(account);
    } catch (e) {
      const code = (e as any).code ?? "";
      if (source === "api" || !/scope|permission|access_token/i.test(code + (e as Error).message)) throw e;
      note = `API scopes missing (${(e as Error).message}); used profile scrape instead.`;
      // creator_info works with the posting scopes we already have and tells us the @username.
      const info = await creatorInfo(await accessToken(account));
      data = await fromScrape(account, prev?.username ?? info.creator_username);
      Object.assign(data, { displayName: info.creator_nickname, avatar: (info as any).creator_avatar_url });
    }
  }
  linkDrafts(data.posts);
  const totalViews = data.posts.reduce((s, p) => s + p.views, 0);
  const now = new Date().toISOString();
  const stats: AccountStats = {
    account,
    username: data.username ?? prev?.username,
    displayName: (data as any).displayName ?? prev?.displayName ?? acc.displayName,
    avatar: (data as any).avatar ?? prev?.avatar,
    syncedAt: now,
    source: data.source,
    profile: { ...prev?.profile, ...Object.fromEntries(Object.entries(data.profile).filter(([, v]) => v !== undefined)) },
    history: [...(prev?.history ?? []), { at: now, ...data.profile, totalViews }].slice(-365),
    posts: data.posts.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")),
  };
  writeJson(file(account), stats);
  if (note) console.error(note);
  return stats;
}

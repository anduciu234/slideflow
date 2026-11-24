/**
 * TikTok Content Posting API — photo posts.
 * https://developers.tiktok.com/doc/content-posting-api-reference-photo-post
 *
 * - mode "draft"  → post_mode MEDIA_UPLOAD: lands in the creator's TikTok inbox; they tap publish.
 *                   Works before your app passes TikTok's audit.
 * - mode "direct" → post_mode DIRECT_POST: publishes straight to the profile. Until the app is
 *                   audited, only privacy SELF_ONLY works and the account must be private.
 */
import type { PostMode } from "../types.js";

const BASE = "https://open.tiktokapis.com/v2/post/publish";

async function call<T>(token: string, endpoint: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(body ?? {}),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || (j.error?.code && j.error.code !== "ok")) {
    throw new Error(`TikTok ${endpoint} → ${j.error?.code ?? res.status}: ${j.error?.message ?? ""} (log_id ${j.error?.log_id ?? "?"})`);
  }
  return j.data as T;
}

export interface CreatorInfo {
  creator_username: string;
  creator_nickname: string;
  privacy_level_options: string[];
  comment_disabled: boolean;
  max_video_post_duration_sec: number;
}

export const creatorInfo = (token: string) => call<CreatorInfo>(token, "/creator_info/query/", {});

export async function postPhotos(opts: {
  token: string;
  imageUrls: string[];
  title: string;
  description: string;
  mode: PostMode;
  privacy?: string;
  coverIndex?: number;
  autoMusic?: boolean;
  disableComment?: boolean;
  brandOrganic?: boolean;
  brandedContent?: boolean;
}): Promise<string> {
  const post_info: Record<string, unknown> = {
    title: opts.title.slice(0, 90),
    description: opts.description.slice(0, 4000),
  };
  if (opts.mode === "direct") {
    const info = await creatorInfo(opts.token);
    // TikTok's UX rules: privacy is chosen explicitly by the user (no default in the UI).
    if (!opts.privacy) throw new Error("Direct post needs a privacy level chosen by the user");
    const privacy = opts.privacy;
    if (opts.brandedContent && privacy === "SELF_ONLY") throw new Error("Branded content can't be private (TikTok rule)");
    if (!info.privacy_level_options.includes(privacy)) {
      throw new Error(`Privacy ${privacy} not allowed for this account. Options: ${info.privacy_level_options.join(", ")}`);
    }
    Object.assign(post_info, {
      privacy_level: privacy,
      disable_comment: opts.disableComment ?? true,
      auto_add_music: opts.autoMusic ?? true,
      brand_content_toggle: !!opts.brandedContent,
      brand_organic_toggle: !!opts.brandOrganic,
    });
  }
  const data = await call<{ publish_id: string }>(opts.token, "/content/init/", {
    post_info,
    source_info: {
      source: "PULL_FROM_URL",
      photo_cover_index: opts.coverIndex ?? 0,
      photo_images: opts.imageUrls,
    },
    post_mode: opts.mode === "direct" ? "DIRECT_POST" : "MEDIA_UPLOAD",
    media_type: "PHOTO",
  });
  return data.publish_id;
}

export interface PublishStatus {
  status: string; // PROCESSING_DOWNLOAD | SEND_TO_USER_INBOX | PUBLISH_COMPLETE | FAILED
  fail_reason?: string;
  publicaly_available_post_id?: string[];
}

export const publishStatus = (token: string, publishId: string) =>
  call<PublishStatus>(token, "/status/fetch/", { publish_id: publishId });

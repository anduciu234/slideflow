export interface PostStats {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
}

/** A TikTok photo slideshow found during research. */
export interface ResearchedSlideshow {
  id: string;
  url: string;
  author: string;
  caption: string;
  createdAt: string | null;
  stats: PostStats;
  imageUrls: string[];
  /** Downloaded JPGs Claude can open with its Read tool. */
  localImages: string[];
  music?: string;
  topComments?: string[];
  source: "apify" | "browser";
  fetchedAt: string;
}

/**
 * TikTok text looks:
 * - classic: white text, thin dark outline, medium weight (TikTok's default text: most POV/phone-photo slideshows)
 * - outline: white text, thick black stroke (bold meme/hook look)
 * - plain: white text with soft shadow (TikTok text with no background)
 * - box: each line on a rounded solid background (TikTok "background" text; default white bg, black text)
 * - translucent: each line on a semi-transparent dark background
 * - sticker: one solid rotated label block (e.g. "Friday: $36/hr")
 * - none: just coloured text, no effects (designed slides, e.g. dark text on cream)
 */
export type TextStyle = "classic" | "outline" | "plain" | "box" | "translucent" | "sticker" | "none";

/**
 * classic = Figtree with tight tracking: closest free match to TikTok's "Classic" in-app font, used by most viral slideshows (default).
 * tiktok = TikTok Sans (TikTok's newer default). Others mimic TikTok's typewriter/handwriting/serif styles.
 */
export type FontKey = "classic" | "tiktok" | "typewriter" | "handwriting" | "serif" | "rounded" | "condensed";

export interface TextLayer {
  type: "text";
  /** Use \n for line breaks and **word** to highlight a word (accent colour, or marker highlight in "none"/"plain" styles). */
  text: string;
  /** Centre of the block, % of slide width (default 50) / height. */
  x?: number;
  y: number;
  /** Block width as % of slide width (default 84). */
  width?: number;
  style?: TextStyle;
  font?: FontKey;
  /** px at 1080 wide (default 60). */
  size?: number;
  weight?: number;
  color?: string;
  /** Background colour for box/sticker styles. */
  bg?: string;
  /** Colour for **highlighted** words. */
  accent?: string;
  align?: "center" | "left" | "right";
  rotate?: number;
  uppercase?: boolean;
  lineHeight?: number;
  /** em, e.g. -0.03. Default: -0.03 for the classic font, 0 otherwise. */
  letterSpacing?: number;
}

export interface ImageLayer {
  type: "image";
  /** Same sources as a slide background (assets file, absolute path, https URL). */
  src: string;
  x?: number;
  y: number;
  /** Width as % of slide width. */
  width: number;
  radius?: number;
  rotate?: number;
  shadow?: boolean;
  /** CSS border, e.g. "6px solid #fff". */
  border?: string;
}

export type Layer = TextLayer | ImageLayer;

export interface SlideSpec {
  /**
   * Background: a file in library/assets (e.g. "salad.jpg"), an absolute path,
   * an https URL, or a CSS colour/gradient like "color:#111" / "color:linear-gradient(...)".
   */
  image: string;
  /** cover (default) fills the 9:16 frame; contain shows the whole image (e.g. a screenshot) over a blurred copy. */
  fit?: "cover" | "contain";
  /** Darken the background so text pops, 0–1. Default 0. */
  dim?: number;
  /** Any number of text/image layers, drawn in order. Preferred over the single-text fields below. */
  layers?: Layer[];
  // --- legacy single-text shorthand (converted to one text layer) ---
  text?: string;
  /** Vertical position of the text block's centre, 0 (top) – 100 (bottom). Default 50. */
  position?: number;
  style?: TextStyle;
  /** px at 1080 wide. Default 64. */
  fontSize?: number;
  align?: "center" | "left";
}

export interface Draft {
  id: string;
  title: string;
  caption: string;
  slides: SlideSpec[];
  /** "3:4" (1080x1440) for camera-roll photo formats, "9:16" (1080x1920, default) for designed slides. */
  aspect?: "9:16" | "3:4";
  /** "phone" = unified camera-roll grade over photo backgrounds. */
  look?: "none" | "phone";
  renders: string[];
  /** Research post ids or pattern names this was modelled on. */
  basedOn?: string[];
  /** Set when the user approves the draft for autopilot scheduling. */
  approvedAt?: string;
  /** App slug this draft markets (library/apps/<slug>.json). */
  app?: string;
  createdAt: string;
  updatedAt: string;
}

export type PostMode = "draft" | "direct";

export interface QueueItem {
  id: string;
  draftId: string;
  account: string;
  scheduledAt: string;
  mode: PostMode;
  privacy?: string;
  autoMusic?: boolean;
  /** Per-post overrides chosen on the post screen. */
  title?: string;
  caption?: string;
  /** TikTok "Allow comments" unchecked → true. Direct post only. */
  disableComment?: boolean;
  /** Commercial content disclosure (direct post only): "Your brand" / "Branded content". */
  brandOrganic?: boolean;
  brandedContent?: boolean;
  status: "queued" | "uploading" | "processing" | "done" | "failed" | "cancelled";
  publishId?: string;
  tiktokStatus?: string;
  error?: string;
  updatedAt: string;
}

export interface TikTokAccount {
  name: string;
  openId: string;
  displayName: string;
  accessToken: string;
  refreshToken: string;
  /** epoch ms */
  accessExpiresAt: number;
  refreshExpiresAt: number;
  scope: string;
}

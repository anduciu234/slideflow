/**
 * Renders slides to 1080x1920 JPGs (TikTok photo posts accept JPG/WEBP, not PNG).
 * A slide is a background plus any number of layers (text blocks, stickers, images),
 * styled to match TikTok's in-app text tool, so researched formats can be copied closely.
 * Fonts are local (library/assets/fonts, fetched by src/cli/fetch-fonts.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";
import { PATHS } from "../config.js";
import type { FontKey, ImageLayer, Layer, SlideSpec, TextLayer } from "../types.js";

// Set per render: 1080x1920 (9:16) or 1080x1440 (3:4, camera-roll photos).
let W = 1080;
let H = 1920;
let LOOK: Look = "none";
export type Aspect = "9:16" | "3:4";
/** none = untouched; phone = subtle camera-roll grade (slightly warm, softer saturation, grain, vignette) so mixed photos feel like one phone. */
export type Look = "none" | "phone";

// ---------- fonts ----------
const FONT_DIR = path.join(PATHS.assets, "fonts");
// Single quotes only: these go inside style="..." attributes.
const FONT_STACK: Record<FontKey, string> = {
  classic: `'F-classic', 'Proxima Nova', 'Helvetica Neue', Arial, sans-serif`,
  tiktok: `'F-tiktok', 'Helvetica Neue', Arial, sans-serif`,
  typewriter: `'F-typewriter', 'Courier New', monospace`,
  handwriting: `'F-handwriting', 'Marker Felt', cursive`,
  serif: `'F-serif', Georgia, serif`,
  rounded: `'F-rounded', 'Arial Rounded MT Bold', sans-serif`,
  condensed: `'F-condensed', Impact, sans-serif`,
};
let fontManifest: { key: string; weight: string; file: string; unicodeRange: string }[] | null = null;
function fontFaces(keys: Set<FontKey>): string {
  fontManifest ??= (() => {
    try {
      return JSON.parse(fs.readFileSync(path.join(FONT_DIR, "fonts.json"), "utf8"));
    } catch {
      console.error("No local fonts; run: npx tsx src/cli/fetch-fonts.ts (falling back to system fonts)");
      return [];
    }
  })();
  return fontManifest!
    .filter((f) => keys.has(f.key as FontKey))
    .map((f) => {
      const b64 = fs.readFileSync(path.join(FONT_DIR, f.file)).toString("base64");
      return `@font-face{font-family:"F-${f.key}";font-weight:${f.weight};font-display:block;src:url(data:font/woff2;base64,${b64}) format("woff2");unicode-range:${f.unicodeRange}}`;
    })
    .join("\n");
}

// ---------- images ----------
async function loadImage(src: string): Promise<Buffer> {
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`Could not fetch ${src}: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const file = path.isAbsolute(src) ? src : path.join(PATHS.assets, src);
  if (!fs.existsSync(file)) throw new Error(`Image not found: ${file}`);
  return fs.readFileSync(file);
}
const dataUri = (buf: Buffer, mime = "image/jpeg") => `data:${mime};base64,${buf.toString("base64")}`;

async function backgroundHtml(s: SlideSpec): Promise<string> {
  if (s.image.startsWith("color:")) return `<div class="bg" style="background:${s.image.slice(6)}"></div>`;
  const buf = await loadImage(s.image);
  if (s.fit === "contain") {
    const blur = await sharp(buf).rotate().resize(W / 4, H / 4, { fit: "cover" }).blur(12).jpeg({ quality: 70 }).toBuffer();
    const fg = await sharp(buf).rotate().resize(W, H, { fit: "inside" }).png().toBuffer();
    return `<div class="bg" style="background:url(${dataUri(blur)}) center/cover;filter:brightness(.6)"></div>
      <div class="bg" style="background:url(${dataUri(fg, "image/png")}) center/contain no-repeat"></div>`;
  }
  const jpg = await sharp(buf).rotate().resize(W, H, { fit: "cover", position: "attention" }).jpeg({ quality: 90 }).toBuffer();
  return `<div class="bg" style="background:url(${dataUri(jpg)}) center/cover"></div>`;
}

// ---------- text ----------
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function textLayerHtml(l: TextLayer): string {
  const style = l.style ?? "outline";
  const size = l.size ?? 60;
  const fontKey = l.font ?? "classic";
  const font = FONT_STACK[fontKey];
  const tracking = l.letterSpacing ?? (fontKey === "classic" ? -0.03 : 0);
  const weight = l.weight ?? (style === "classic" ? 600 : l.font === "handwriting" || l.font === "typewriter" ? 700 : 800);
  const accent = l.accent ?? (style === "box" ? "#ff3d6e" : "#ffd23f");
  const lh = l.lineHeight ?? (style === "box" || style === "translucent" ? 1.42 : 1.22);
  const align = l.align ?? "center";

  let color = l.color ?? "#fff";
  let block = "";
  let line = "";
  let hl = `color:${accent}`;
  switch (style) {
    case "classic":
      block = `-webkit-text-stroke:${Math.max(3, Math.round(size * 0.08))}px rgba(0,0,0,.9);paint-order:stroke fill;text-shadow:0 2px 8px rgba(0,0,0,.45);`;
      break;
    case "outline":
      block = `-webkit-text-stroke:${Math.max(4, Math.round(size * 0.12))}px #000;paint-order:stroke fill;`;
      break;
    case "plain":
      block = `text-shadow:0 2px 12px rgba(0,0,0,.55),0 0 3px rgba(0,0,0,.6);`;
      break;
    case "box":
      color = l.color ?? "#000";
      line = `background:${l.bg ?? "#fff"};padding:${size * 0.1}px ${size * 0.3}px;border-radius:${size * 0.22}px;box-decoration-break:clone;-webkit-box-decoration-break:clone;`;
      break;
    case "translucent":
      line = `background:${l.bg ?? "rgba(0,0,0,.62)"};padding:${size * 0.1}px ${size * 0.28}px;border-radius:${size * 0.16}px;box-decoration-break:clone;-webkit-box-decoration-break:clone;`;
      break;
    case "sticker":
      color = l.color ?? "#fff";
      line = `display:inline-block;background:${l.bg ?? "#111"};padding:${size * 0.22}px ${size * 0.42}px;border-radius:${size * 0.25}px;box-shadow:0 10px 30px rgba(0,0,0,.35);`;
      break;
    case "none":
      color = l.color ?? "#111";
      // marker-style highlight behind **words**, like many designed slideshows
      hl = `background:linear-gradient(transparent 55%, ${l.accent ?? "#ffc9a3"} 55%);padding:0 .08em`;
      break;
  }
  let body = esc(l.uppercase ? l.text.toUpperCase() : l.text)
    .replace(/\*\*(.+?)\*\*/g, `<span style="${hl}">$1</span>`)
    .replace(/\n/g, "<br>");
  const x = l.x ?? 50;
  const width = l.width ?? ((l.font ?? "classic") === "classic" && (style === "classic" || style === "outline") ? 74 : 84);
  return `<div class="layer" style="left:${x}%;top:${l.y}%;width:${width}%;transform:translate(-50%,-50%) rotate(${l.rotate ?? 0}deg);text-align:${align};
    font-family:${font};font-size:${size}px;font-weight:${weight};letter-spacing:${tracking}em;line-height:${lh};color:${color};${block}">
    <span style="${line}">${body}</span></div>`;
}

async function imageLayerHtml(l: ImageLayer): Promise<string> {
  const buf = await sharp(await loadImage(l.src)).rotate().resize(Math.round((W * l.width) / 100)).png().toBuffer();
  return `<img class="layer" src="${dataUri(buf, "image/png")}" style="left:${l.x ?? 50}%;top:${l.y}%;width:${l.width}%;
    transform:translate(-50%,-50%) rotate(${l.rotate ?? 0}deg);border-radius:${l.radius ?? 0}px;${l.border ? `border:${l.border};` : ""}
    ${l.shadow ? "box-shadow:0 24px 60px rgba(0,0,0,.45);" : ""}">`;
}

/** Converts the legacy single-text fields into a layer. */
function layersOf(s: SlideSpec): Layer[] {
  const layers = [...(s.layers ?? [])];
  if (s.text)
    layers.unshift({ type: "text", text: s.text, y: s.position ?? 50, style: s.style, size: s.fontSize ?? 64, align: s.align });
  return layers;
}

async function slideHtml(s: SlideSpec) {
  const layers = layersOf(s);
  const fonts = new Set<FontKey>(layers.filter((l): l is TextLayer => l.type === "text").map((l) => l.font ?? "classic"));
  const parts = await Promise.all(layers.map((l) => (l.type === "text" ? textLayerHtml(l) : imageLayerHtml(l))));
  const grain = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 .9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`;
  const look = LOOK === "phone" && !s.image.startsWith("color:")
    ? `.bg{filter:saturate(.9) contrast(1.05) sepia(.08) brightness(.98)}
       .look{position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(0,0,0,.28) 100%)}
       .look::after{content:"";position:absolute;inset:0;background-image:${grain};opacity:.07;mix-blend-mode:overlay}`
    : `.look{display:none}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${fontFaces(fonts)}
    ${look}
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${W}px;height:${H}px;overflow:hidden;background:#000}
    .bg{position:absolute;inset:0}
    .dim{position:absolute;inset:0;background:rgba(0,0,0,${s.dim ?? 0})}
    .layer{position:absolute;word-wrap:break-word}
  </style></head><body>${await backgroundHtml(s)}<div class="dim"></div><div class="look"></div>${parts.join("\n")}</body></html>`;
}

/** Renders all slides into library/renders/<outName>/NN.jpg and returns the file paths. */
export async function renderSlides(
  slides: SlideSpec[],
  outName: string,
  opts: { aspect?: Aspect; look?: Look } = {},
): Promise<string[]> {
  W = 1080;
  H = opts.aspect === "3:4" ? 1440 : 1920;
  LOOK = opts.look ?? "none";
  if (!slides.length) throw new Error("No slides");
  if (slides.length > 35) throw new Error("TikTok allows at most 35 photos per post");
  const dir = path.join(PATHS.renders, outName);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const out: string[] = [];
    for (const [i, s] of slides.entries()) {
      await page.setContent(await slideHtml(s), { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const file = path.join(dir, `${String(i + 1).padStart(2, "0")}.jpg`);
      await page.screenshot({ path: file, type: "jpeg", quality: 92 });
      out.push(file);
    }
    return out;
  } finally {
    await browser.close();
  }
}

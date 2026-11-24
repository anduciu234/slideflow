/**
 * Downloads the open fonts used to mimic TikTok's text styles into library/assets/fonts.
 *   npx tsx src/cli/fetch-fonts.ts
 * Only the latin + latin-ext subsets are kept (covers €, accents for EU languages).
 */
import fs from "node:fs";
import path from "node:path";
import { PATHS } from "../config.js";

export const FONT_FAMILIES: Record<string, string> = {
  // key → Google Fonts family spec
  classic: "Figtree:wght@500;600;700;800", // closest free match to TikTok's "Classic" text font (tested side by side)
  tiktok: "TikTok Sans:wght@400;600;700;800;900", // TikTok's own open-source typeface (newer default look)
  typewriter: "Courier Prime:wght@400;700",
  handwriting: "Kalam:wght@400;700",
  serif: "Playfair Display:wght@700;900",
  rounded: "Fredoka:wght@500;600;700",
  condensed: "Bebas Neue",
};

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const dir = path.join(PATHS.assets, "fonts");
fs.mkdirSync(dir, { recursive: true });
const manifest: { key: string; family: string; weight: string; subset: string; file: string; unicodeRange: string }[] = [];

for (const [key, spec] of Object.entries(FONT_FAMILIES)) {
  const css = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(spec).replace(/%20/g, "+")}&display=swap`, {
    headers: { "User-Agent": UA },
  }).then((r) => r.text());
  const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*{([^}]*)}/g)];
  let n = 0;
  for (const [, subset, body] of blocks) {
    if (subset !== "latin" && subset !== "latin-ext") continue;
    const weight = body.match(/font-weight:\s*(\d+)/)?.[1] ?? "400";
    const url = body.match(/url\(([^)]+\.woff2)\)/)?.[1];
    const range = body.match(/unicode-range:\s*([^;]+);/)?.[1] ?? "";
    if (!url) continue;
    const file = `${key}-${weight}-${subset}.woff2`;
    fs.writeFileSync(path.join(dir, file), Buffer.from(await (await fetch(url)).arrayBuffer()));
    manifest.push({ key, family: spec.split(":")[0], weight, subset, file, unicodeRange: range });
    n++;
  }
  console.log(`${key} (${spec.split(":")[0]}): ${n} files${n ? "" : "  ← NOT FOUND"}`);
}
fs.writeFileSync(path.join(dir, "fonts.json"), JSON.stringify(manifest, null, 1));

/**
 * Saves slide images found online (Pinterest, image search, ChatGPT exports) into
 * library/assets/<folder>/NN.jpg. Pinterest thumbnails are upgraded to the original
 * resolution. Every file is validated as a real image and normalised to JPG.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PATHS } from "./config.js";

/** i.pinimg.com/236x/ab/cd/x.jpg → i.pinimg.com/originals/ab/cd/x.jpg */
export function pinterestOriginal(url: string): string {
  return url.replace(/^(https:\/\/i\.pinimg\.com\/)(\d+x|\d+x\d+(_RS)?)\//, "$1originals/");
}

const ALLOWED_HOSTS = /(^|\.)pinimg\.com$|(^|\.)pinterest\.com$|(^|\.)unsplash\.com$|(^|\.)pexels\.com$|(^|\.)oaiusercontent\.com$/;

export interface SaveResult {
  file?: string;
  url: string;
  width?: number;
  height?: number;
  error?: string;
}

export async function saveImages(urls: string[], folder: string, startAt = 1): Promise<SaveResult[]> {
  if (!/^[\w.-]+$/.test(folder)) throw new Error("folder must be a simple name (letters, numbers, - _ .)");
  const dir = path.join(PATHS.assets, folder);
  fs.mkdirSync(dir, { recursive: true });
  const out: SaveResult[] = [];
  for (const [i, raw] of urls.entries()) {
    const n = String(startAt + i).padStart(2, "0");
    let url = raw;
    try {
      const host = new URL(raw).hostname;
      if (!ALLOWED_HOSTS.test(host)) throw new Error(`host ${host} not in the image allow-list`);
      url = pinterestOriginal(raw);
      let res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.pinterest.com/" } });
      if (!res.ok && url !== raw) {
        url = raw.replace(/\/\d+x\//, "/736x/"); // originals missing for some pins → largest thumbnail
        res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.pinterest.com/" } });
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const meta = await sharp(buf).metadata(); // throws if not an image
      if (!meta.width || meta.width < 500) throw new Error(`too small (${meta.width}px wide)`);
      const file = path.join(dir, `${n}.jpg`);
      await sharp(buf).rotate().jpeg({ quality: 92 }).toFile(file);
      out.push({ file, url, width: meta.width, height: meta.height });
    } catch (e) {
      out.push({ url, error: (e as Error).message });
    }
  }
  return out;
}

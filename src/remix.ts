/**
 * Helpers for remaking a researched slideshow closely: contact sheets (a whole
 * slideshow in one image) and a remix plan with the checklist Claude follows.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PATHS, readJson, relocate } from "./config.js";
import { summarize } from "./research/index.js";
import type { Draft, ResearchedSlideshow } from "./types.js";

function slidesFor(id: string): { files: string[]; kind: "research" | "draft" } {
  const post = readJson<ResearchedSlideshow | null>(path.join(PATHS.research, id, "post.json"), null);
  if (post) return { files: post.localImages.map(relocate), kind: "research" };
  const draft = readJson<Draft | null>(path.join(PATHS.drafts, `${id}.json`), null);
  if (draft) return { files: draft.renders.map(relocate), kind: "draft" };
  throw new Error(`No research post or draft with id ${id}`);
}

/** Grid of numbered thumbnails (≤5 per row). Returns the image path. */
export async function contactSheet(id: string): Promise<string> {
  const { files, kind } = slidesFor(id);
  if (!files.length) throw new Error(`${id} has no slide images`);
  const TW = 324, TH = 576, G = 10, LABEL = 44;
  const cols = Math.min(5, files.length);
  const rows = Math.ceil(files.length / cols);
  const tiles = await Promise.all(
    files.map(async (f, i) => {
      const img = await sharp(f).resize(TW, TH, { fit: "contain", background: "#1a1a1a" }).toBuffer();
      const label = Buffer.from(
        `<svg width="${TW}" height="${LABEL}"><rect width="100%" height="100%" fill="#111"/><text x="12" y="31" font-family="Helvetica" font-size="26" font-weight="700" fill="#fff">${i + 1}</text></svg>`,
      );
      return sharp({ create: { width: TW, height: TH + LABEL, channels: 3, background: "#111" } })
        .composite([{ input: label, top: 0, left: 0 }, { input: img, top: LABEL, left: 0 }])
        .png()
        .toBuffer();
    }),
  );
  const out = path.join(kind === "research" ? path.join(PATHS.research, id) : path.join(PATHS.renders, id), "_sheet.jpg");
  await sharp({ create: { width: cols * TW + (cols - 1) * G, height: rows * (TH + LABEL) + (rows - 1) * G, channels: 3, background: "#fff" } })
    .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * (TW + G), top: Math.floor(i / cols) * (TH + LABEL + G) })))
    .jpeg({ quality: 82 })
    .toFile(out);
  return out;
}

export async function remixPlan(postId: string) {
  const post = readJson<ResearchedSlideshow | null>(path.join(PATHS.research, postId, "post.json"), null);
  if (!post) throw new Error(`No research post ${postId}. Run research_slideshows or get_slideshow first.`);
  const sheet = await contactSheet(postId);
  const assetDir = path.join(PATHS.assets, `remix-${postId}`);
  fs.mkdirSync(assetDir, { recursive: true });
  return {
    original: { ...summarize(post), caption: post.caption, contactSheet: sheet },
    imageFolder: assetDir,
    checklist: [
      "1. Read the contact sheet, then Read each original slide you need in detail.",
      "2. For EVERY slide write down: text (exact wording + role), position (y% of each block), style (outline/plain/box/translucent/sticker/none), font look, size, colours, highlighted words, stickers, and what the background photo shows (subject, angle, lighting, phone-photo vs designed).",
      "3. Rewrite the text for our brand (library/brand.md): same structure, same length per slide, same hook formula and rhythm. Never copy sentences verbatim.",
      "4. Backgrounds: write one image prompt per slide that recreates the TYPE of photo (not the same photo), e.g. 'vertical 9:16 iPhone photo, POV from a car driver's seat at night, dashboard glow, slightly grainy, no text'. Ask for NO text in the image — text is added as layers.",
      `5. Generate images (ChatGPT in Chrome, see CLAUDE.md) and save them to ${assetDir}/NN.jpg (01.jpg = slide 1). Reuse one image across slides where the original does.`,
      "6. create_draft with layers matching step 2 positions/styles (y%, size, style, rotate for stickers, fit:'contain' for screenshots). Text-only/designed slides can use color: backgrounds.",
      "7. contact_sheet(draftId) and compare side by side with the original contact sheet; fix spacing/size/position until it reads the same at a glance.",
    ],
  };
}

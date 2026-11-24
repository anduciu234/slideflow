import fs from "node:fs";
import path from "node:path";
import { id, PATHS, readJson, writeJson } from "./config.js";
import { renderSlides } from "./render/render.js";
import type { Draft, SlideSpec } from "./types.js";

const file = (draftId: string) => path.join(PATHS.drafts, `${draftId}.json`);

export function getDraft(draftId: string): Draft {
  const d = readJson<Draft | null>(file(draftId), null);
  if (!d) throw new Error(`No draft ${draftId}`);
  return d;
}

export function listDrafts(): Draft[] {
  return fs
    .readdirSync(PATHS.drafts)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<Draft | null>(path.join(PATHS.drafts, f), null))
    .filter((d): d is Draft => !!d)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Create a draft, or replace an existing one's content when draftId is given. Always re-renders. */
export async function saveDraft(input: {
  draftId?: string;
  title: string;
  caption: string;
  slides: SlideSpec[];
  basedOn?: string[];
  aspect?: Draft["aspect"];
  look?: Draft["look"];
  app?: string;
}): Promise<Draft> {
  const now = new Date().toISOString();
  const prev = input.draftId ? getDraft(input.draftId) : null;
  const draftId = prev?.id ?? id("draft");
  const aspect = input.aspect ?? prev?.aspect;
  const look = input.look ?? prev?.look;
  const renders = await renderSlides(input.slides, draftId, { aspect, look });
  const d: Draft = {
    id: draftId,
    title: input.title.slice(0, 90),
    caption: input.caption,
    slides: input.slides,
    aspect,
    look,
    renders,
    basedOn: input.basedOn ?? prev?.basedOn,
    approvedAt: prev?.approvedAt,
    app: input.app ?? prev?.app,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };
  writeJson(file(draftId), d);
  return d;
}

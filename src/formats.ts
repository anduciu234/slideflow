/**
 * Formats library: the slideshow formats we actually use, each with its source
 * posts, pattern notes, a reusable spec template and example drafts.
 * Stored as library/formats/<slug>.json so the dashboard always shows them.
 */
import fs from "node:fs";
import path from "node:path";
import { LIB, readJson, writeJson } from "./config.js";

export const FORMATS_DIR = path.join(LIB, "formats");
fs.mkdirSync(FORMATS_DIR, { recursive: true });

export type FormatStatus = "active" | "testing" | "idea" | "retired";

export interface Format {
  slug: string;
  name: string;
  status: FormatStatus;
  /** One-line hook formula, e.g. "How to hit €X a day driving Uber". */
  hook: string;
  description: string;
  slideCount: number;
  /** Research post ids this format copies. */
  sourcePosts: string[];
  /** Why the source worked (stats summary). */
  sourceStats?: string;
  /** library/patterns/<name>.md */
  pattern?: string;
  /** library/specs/<name>.json used as the template */
  spec?: string;
  /** Drafts made from this format. */
  drafts: string[];
  notes?: string;
  /** App slug this format is used for. */
  app?: string;
  createdAt: string;
  updatedAt: string;
}

const file = (slug: string) => path.join(FORMATS_DIR, `${slug}.json`);

export function listFormats(): Format[] {
  return fs
    .readdirSync(FORMATS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<Format | null>(path.join(FORMATS_DIR, f), null))
    .filter((f): f is Format => !!f)
    .sort((a, b) => ["active", "testing", "idea", "retired"].indexOf(a.status) - ["active", "testing", "idea", "retired"].indexOf(b.status));
}

export function getFormat(slug: string): Format | null {
  return readJson<Format | null>(file(slug), null);
}

export function saveFormat(input: Partial<Format> & { slug: string; name: string }): Format {
  if (!/^[a-z0-9-]+$/.test(input.slug)) throw new Error("slug: lowercase letters, numbers, dashes");
  const prev = getFormat(input.slug);
  const now = new Date().toISOString();
  const base: Omit<Format, "slug" | "name" | "createdAt" | "updatedAt"> = {
    status: "testing",
    hook: "",
    description: "",
    slideCount: 0,
    sourcePosts: [],
    drafts: [],
  };
  const f: Format = {
    ...base,
    ...prev,
    ...input,
    drafts: [...new Set([...(prev?.drafts ?? []), ...(input.drafts ?? [])])],
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };
  writeJson(file(f.slug), f);
  return f;
}

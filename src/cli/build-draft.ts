/**
 * Builds (or rebuilds) a draft from a JSON spec file:
 *   npx tsx src/cli/build-draft.ts library/specs/<name>.json
 * Spec: { draftId?, title, caption, basedOn?, slides: SlideSpec[] }
 * Missing background/image files are replaced by a dark placeholder (with a warning),
 * so layouts can be checked before the real images exist. The draft id is written
 * back into the spec so re-running updates the same draft.
 */
import fs from "node:fs";
import path from "node:path";
import { PATHS } from "../config.js";
import { saveDraft } from "../drafts.js";
import { contactSheet } from "../remix.js";
import type { SlideSpec } from "../types.js";

const file = process.argv[2];
if (!file) throw new Error("usage: build-draft.ts <spec.json>");
const spec = JSON.parse(fs.readFileSync(file, "utf8"));

const exists = (src: string) =>
  src.startsWith("color:") || /^https?:/.test(src) || fs.existsSync(path.isAbsolute(src) ? src : path.join(PATHS.assets, src));
const PLACEHOLDER = "color:linear-gradient(170deg,#3a3d42 0%,#1c1d20 60%,#0e0e10 100%)";
const missing: string[] = [];

const slides: SlideSpec[] = spec.slides.map((s: SlideSpec) => {
  const out = { ...s };
  if (!exists(s.image)) {
    missing.push(s.image);
    out.image = PLACEHOLDER;
  }
  out.layers = s.layers?.filter((l) => {
    if (l.type !== "image" || exists(l.src)) return true;
    missing.push(l.src);
    return false;
  });
  return out;
});

const d = await saveDraft({ draftId: spec.draftId, title: spec.title, caption: spec.caption, basedOn: spec.basedOn, aspect: spec.aspect, look: spec.look, app: spec.app, slides });
if (!spec.draftId) fs.writeFileSync(file, JSON.stringify({ draftId: d.id, ...spec }, null, 2));
if (missing.length) console.warn(`⚠ ${missing.length} image(s) missing, used placeholders:\n  ` + [...new Set(missing)].join("\n  "));
console.log("draft", d.id);
console.log("sheet", await contactSheet(d.id));

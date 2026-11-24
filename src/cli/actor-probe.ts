// Runs an actor with a small JSON input and summarises the output shape.
//   npx tsx src/cli/actor-probe.ts <actor> '<json input>' [out.json]
import fs from "node:fs";
import { requireEnv } from "../config.js";

const [actor, inputJson, out] = process.argv.slice(2);
const res = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?timeout=240`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${requireEnv("APIFY_TOKEN")}` },
  body: inputJson,
});
const items: any[] = await res.json();
if (out) fs.writeFileSync(out, JSON.stringify(items, null, 1));
console.log("status", res.status, "items", Array.isArray(items) ? items.length : JSON.stringify(items).slice(0, 300));
if (!Array.isArray(items) || !items.length) process.exit();
console.log("keys:", Object.keys(items[0]).join(", "));
const isPhoto = (i: any) => !!(i.imagePost || i.image_post_info || i.isSlideshow || i.slideshowImageLinks?.length || i.images?.length || i.imagePostImages);
const photos = items.filter(isPhoto);
console.log("photo posts:", photos.length);
if (photos[0]) {
  const p = photos[0];
  for (const k of Object.keys(p)) {
    const v = p[k];
    if (/image|slide|photo/i.test(k)) console.log(" ", k, "=", JSON.stringify(v).slice(0, 400));
  }
}

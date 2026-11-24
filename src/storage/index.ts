import { env } from "../config.js";
import { uploadRenders as uploadRendersS3 } from "./upload.js";
import { uploadRendersVercel } from "./vercel.js";

/** STORAGE=vercel (default) or s3. Returns public URLs on the TikTok-verified prefix. */
export function uploadRenders(files: string[], prefix: string) {
  return (env("STORAGE") ?? "vercel") === "s3" ? uploadRendersS3(files, prefix) : uploadRendersVercel(files, prefix);
}

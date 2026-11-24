/**
 * Uploads rendered slides to an S3-compatible bucket (Cloudflare R2, S3, B2…).
 * TikTok photo posts pull images from URLs on a domain verified in your TikTok
 * developer portal, so PUBLIC_BASE_URL must be on that domain.
 */
import fs from "node:fs";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env, requireEnv } from "../config.js";

let client: S3Client | null = null;
function s3() {
  client ??= new S3Client({
    endpoint: requireEnv("S3_ENDPOINT"),
    region: env("S3_REGION") ?? "auto",
    credentials: {
      accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
    },
  });
  return client;
}

export async function uploadRenders(files: string[], prefix: string): Promise<string[]> {
  const bucket = requireEnv("S3_BUCKET");
  const base = requireEnv("PUBLIC_BASE_URL").replace(/\/$/, "");
  const urls: string[] = [];
  for (const f of files) {
    // Unique key per upload so TikTok never pulls a stale cached image after a re-render.
    const key = `slides/${prefix}/${Date.now().toString(36)}-${path.basename(f)}`;
    await s3().send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: fs.readFileSync(f), ContentType: "image/jpeg" }),
    );
    urls.push(`${base}/${key}`);
  }
  return urls;
}

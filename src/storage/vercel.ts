/**
 * Hosts slide images on the Vercel site whose URL prefix is verified with TikTok.
 * Each upload copies the renders into site/slides/<unique>/ and redeploys the site
 * (a Vercel deploy is a full snapshot, so old folders we delete disappear too).
 */
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { env, requireEnv, ROOT } from "../config.js";

const run = promisify(execFile);
const RETAIN_MS = 2 * 24 * 60 * 60 * 1000; // keep slides 2 days: TikTok may take up to an hour to fetch

const siteDir = () => path.resolve(ROOT, env("VERCEL_SITE_DIR") ?? "site");

function pruneOld(slidesDir: string) {
  if (!fs.existsSync(slidesDir)) return;
  for (const d of fs.readdirSync(slidesDir)) {
    const p = path.join(slidesDir, d);
    if (Date.now() - fs.statSync(p).mtimeMs > RETAIN_MS) fs.rmSync(p, { recursive: true, force: true });
  }
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

/**
 * Right after a deploy, Vercel's edge can briefly serve 404 for some new files
 * (seen in testing: one slide 200, the next 404 seconds later). Require every URL
 * to return 200 on three consecutive rounds, then settle before TikTok fetches.
 */
async function waitUntilLive(urls: string[], timeoutMs = 120_000) {
  const end = Date.now() + timeoutMs;
  let streak = 0;
  while (Date.now() < end) {
    const codes = await Promise.all(
      urls.map((u) => fetch(u, { redirect: "manual", cache: "no-store" }).then((r) => r.status).catch(() => 0)),
    );
    streak = codes.every((c) => c === 200) ? streak + 1 : 0;
    if (streak >= 3) return sleep(10_000);
    await sleep(3000);
  }
  throw new Error(`Uploaded slides never became reliably reachable: ${urls[0]}`);
}

export async function uploadRendersVercel(files: string[], prefix: string): Promise<string[]> {
  const base = requireEnv("PUBLIC_BASE_URL").replace(/\/$/, "");
  const site = siteDir();
  if (!fs.existsSync(path.join(site, ".vercel"))) {
    throw new Error(`${site} isn't linked to a Vercel project. Run: cd site && npx vercel link`);
  }
  const slidesDir = path.join(site, "slides");
  pruneOld(slidesDir);

  const folder = `${prefix}-${Date.now().toString(36)}`;
  const dest = path.join(slidesDir, folder);
  fs.mkdirSync(dest, { recursive: true });
  const urls = files.map((f) => {
    fs.copyFileSync(f, path.join(dest, path.basename(f)));
    return `${base}/slides/${folder}/${path.basename(f)}`;
  });

  try {
    await run("npx", ["--yes", "vercel", "deploy", "--prod", "--yes"], { cwd: site, timeout: 300_000 });
  } catch (e) {
    const err = e as { stderr?: string; message: string };
    throw new Error(`Vercel deploy failed: ${(err.stderr || err.message).slice(-600)}`);
  }
  await waitUntilLive(urls);
  return urls;
}

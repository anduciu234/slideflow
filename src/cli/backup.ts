/**
 * Move Slideflow to another computer (or keep a safety copy).
 *
 *   npm run backup                     → slideflow-backup-YYYY-MM-DD.tar.gz in this folder
 *   npm run restore -- <file.tar.gz>   → unpacks .env + library/ here (won't overwrite unless --force)
 *
 * The backup holds your keys (.env) and TikTok tokens (library/accounts.json):
 * keep it private, never commit or share it. Works on macOS, Windows 10+ and Linux (uses `tar`).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "../config.js";

const [cmd, file] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const force = process.argv.includes("--force");

if (cmd === "backup") {
  const out = file ?? `slideflow-backup-${new Date().toISOString().slice(0, 10)}.tar.gz`;
  const items = [".env", "library"].filter((p) => fs.existsSync(path.join(ROOT, p)));
  execFileSync("tar", ["-czf", out, "--exclude", "library/scheduler.log", ...items], { cwd: ROOT, stdio: "inherit" });
  const mb = (fs.statSync(path.resolve(ROOT, out)).size / 1e6).toFixed(1);
  console.log(`Backup written: ${path.resolve(ROOT, out)} (${mb} MB)`);
  console.log("It contains your API keys and TikTok tokens. Keep it private.");
} else if (cmd === "restore") {
  if (!file || !fs.existsSync(file)) throw new Error("usage: npm run restore -- <backup.tar.gz> [--force]");
  const listing = execFileSync("tar", ["-tzf", file]).toString().split("\n").filter(Boolean);
  const bad = listing.find((p) => p.startsWith("/") || p.split(/[\\/]/).includes("..") || !(p === ".env" || p.startsWith("library")));
  if (bad) throw new Error(`Refusing to restore: unexpected path in backup (${bad})`);
  if (!force && (fs.existsSync(path.join(ROOT, ".env")) || fs.existsSync(path.join(ROOT, "library", "accounts.json")))) {
    throw new Error("This folder already has a .env or connected accounts. Re-run with --force to overwrite.");
  }
  execFileSync("tar", ["-xzf", path.resolve(file)], { cwd: ROOT, stdio: "inherit" });
  console.log(`Restored ${listing.length} files into ${ROOT}. Start with: npm run dashboard`);
} else {
  console.log("usage: npm run backup | npm run restore -- <file.tar.gz> [--force]");
}

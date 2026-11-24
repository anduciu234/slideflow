import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";

export const ROOT = path.resolve(import.meta.dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env"), quiet: true });

export const LIB = path.join(ROOT, "library");
export const PATHS = {
  research: path.join(LIB, "research"),
  patterns: path.join(LIB, "patterns"),
  drafts: path.join(LIB, "drafts"),
  renders: path.join(LIB, "renders"),
  assets: path.join(LIB, "assets"),
  accounts: path.join(LIB, "accounts.json"),
  queue: path.join(LIB, "queue.json"),
  tiktokSession: path.join(LIB, "tiktok-session.json"),
};
for (const p of [PATHS.research, PATHS.patterns, PATHS.drafts, PATHS.renders, PATHS.assets]) {
  fs.mkdirSync(p, { recursive: true });
}

export function env(key: string): string | undefined {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : undefined;
}

export function requireEnv(key: string): string {
  const v = env(key);
  if (!v) throw new Error(`Missing ${key} in .env (see .env.example)`);
  return v;
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

export const id = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

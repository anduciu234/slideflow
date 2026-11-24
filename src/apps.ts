/**
 * Apps: each app you market has a profile (what it is, how it works, audience,
 * markets, tone, competitors…) and its own TikTok accounts. Formats and drafts
 * are tagged with the app they belong to.
 *
 * Stored as library/apps/<slug>.json. Profiles can be filled from the App Store
 * automatically (appstore.ts) and refined by you or by Claude.
 */
import fs from "node:fs";
import path from "node:path";
import { LIB, readJson, writeJson } from "./config.js";

export const APPS_DIR = path.join(LIB, "apps");
fs.mkdirSync(APPS_DIR, { recursive: true });

export interface Competitor {
  name: string;
  appStoreUrl?: string;
  tiktok?: string;
  note?: string;
  rating?: number;
  ratingCount?: number;
}

export interface AppProfile {
  slug: string;
  name: string;
  /** Local file (library-relative or absolute) or URL. */
  icon?: string;
  appStoreUrl?: string;
  website?: string;
  /** One sentence: what it does. */
  oneLiner: string;
  /** How it works, in plain words (what the user does, what they get). */
  howItWorks: string;
  features: string[];
  /** Who it's for. */
  audience: string;
  /** Countries / regions and their units, e.g. "EU (€/km), US ($/mile)". */
  markets: string;
  /** Voice for slideshows. */
  tone: string;
  /** How the app appears in slideshows (CTA placement). */
  cta: string;
  /** Words / claims to avoid. */
  avoid: string;
  hashtags: string[];
  competitors: Competitor[];
  /** Connected TikTok account names (see library/accounts.json). */
  accounts: string[];
  /** Raw App Store data (category, rating, screenshots…). */
  appStore?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

const file = (slug: string) => path.join(APPS_DIR, `${slug}.json`);
export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "app";

export function listApps(): AppProfile[] {
  return fs
    .readdirSync(APPS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<AppProfile | null>(path.join(APPS_DIR, f), null))
    .filter((a): a is AppProfile => !!a)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export const getApp = (slug: string) => readJson<AppProfile | null>(file(slug), null);

export function saveApp(input: Partial<AppProfile> & { name: string; slug?: string }): AppProfile {
  const slug = input.slug ?? slugify(input.name);
  const prev = getApp(slug);
  const now = new Date().toISOString();
  const base: Omit<AppProfile, "slug" | "name" | "createdAt" | "updatedAt"> = {
    oneLiner: "",
    howItWorks: "",
    features: [],
    audience: "",
    markets: "",
    tone: "",
    cta: "Last slide only, as the answer to the problem the slideshow raised.",
    avoid: "Never invent numbers or fake app screenshots.",
    hashtags: [],
    competitors: [],
    accounts: [],
  };
  const app: AppProfile = { ...base, ...prev, ...input, slug, createdAt: prev?.createdAt ?? now, updatedAt: now };
  writeJson(file(slug), app);
  return app;
}

/** Which app an account belongs to. */
export const appForAccount = (account: string) => listApps().find((a) => a.accounts.includes(account));

/** Questions shown when adding an app (and used by Claude to interview the user). */
export const APP_QUESTIONS: { key: keyof AppProfile; q: string; hint: string }[] = [
  { key: "name", q: "What's the app called?", hint: "Sola: Cycle Tracker" },
  { key: "appStoreUrl", q: "App Store link", hint: "https://apps.apple.com/app/id… (fills most of this automatically)" },
  { key: "oneLiner", q: "What does it do, in one sentence?", hint: "Helps women eat and train for each phase of their cycle" },
  { key: "howItWorks", q: "How does it work for the user?", hint: "Log your cycle → see today's phase → get meals and workouts for it" },
  { key: "audience", q: "Who is it for?", hint: "Women 20–35 who track their cycle and care about nutrition" },
  { key: "markets", q: "Which countries / languages?", hint: "US and UK, English" },
  { key: "tone", q: "How should the slideshows sound?", hint: "Friendly big-sister, practical, no medical claims" },
  { key: "competitors", q: "Competitors (apps or TikTok accounts)", hint: "Flo, Clue, @someaccount" },
];

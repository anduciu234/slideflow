/**
 * App Store autofill via Apple's public iTunes Search/Lookup API (free, no key).
 * - lookupApp(url): name, description, category, rating, icon, screenshots…
 * - suggestCompetitors(app): similar apps by the app's keywords/category.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { APPS_DIR, type AppProfile, type Competitor } from "./apps.js";

const idFrom = (url: string) => url.match(/id(\d{6,})/)?.[1];
const countryFrom = (url: string) => url.match(/apps\.apple\.com\/([a-z]{2})\//)?.[1] ?? "us";

async function itunes(pathAndQuery: string) {
  const res = await fetch(`https://itunes.apple.com/${pathAndQuery}`);
  if (!res.ok) throw new Error(`App Store lookup failed: ${res.status}`);
  return (await res.json()) as { resultCount: number; results: any[] };
}

export async function lookupApp(appStoreUrl: string) {
  const id = idFrom(appStoreUrl);
  if (!id) throw new Error("That doesn't look like an App Store link (needs …/id123456789)");
  const country = countryFrom(appStoreUrl);
  let r = await itunes(`lookup?id=${id}&country=${country}`);
  if (!r.resultCount && country !== "us") r = await itunes(`lookup?id=${id}&country=us`);
  const a = r.results[0];
  if (!a) throw new Error("App not found on the App Store (it may be unreleased in that country)");
  return {
    name: a.trackName as string,
    developer: a.artistName as string,
    description: a.description as string,
    category: a.primaryGenreName as string,
    genres: a.genres as string[],
    rating: a.averageUserRating as number | undefined,
    ratingCount: a.userRatingCount as number | undefined,
    price: a.formattedPrice as string,
    iconUrl: (a.artworkUrl512 ?? a.artworkUrl100) as string,
    screenshots: (a.screenshotUrls ?? []) as string[],
    url: a.trackViewUrl as string,
    releaseNotes: a.releaseNotes as string | undefined,
    version: a.version as string,
    country,
  };
}

/** Saves the App Store icon next to the app profile; returns a library-relative path. */
export async function saveIcon(slug: string, iconUrl: string) {
  const buf = Buffer.from(await (await fetch(iconUrl)).arrayBuffer());
  const out = path.join(APPS_DIR, `${slug}-icon.png`);
  await sharp(buf).resize(256, 256).png().toFile(out);
  return path.relative(path.dirname(APPS_DIR), out);
}

/** Turns App Store data into a first-draft profile (you or Claude refine it). */
export function profileFromStore(s: Awaited<ReturnType<typeof lookupApp>>): Partial<AppProfile> {
  const lines = s.description.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const features = lines
    .filter((l) => /^[•\-–*✓✔︎▪●]/.test(l) || (l.length < 110 && /^[A-Z].*[a-z]/.test(l) && !l.endsWith(".")))
    .map((l) => l.replace(/^[•\-–*✓✔︎▪●]\s*/, ""))
    .slice(0, 8);
  return {
    name: s.name,
    appStoreUrl: s.url,
    oneLiner: lines[0]?.slice(0, 160) ?? "",
    howItWorks: lines.slice(1, 4).join(" ").slice(0, 600),
    features,
    appStore: s,
  };
}

/** Similar apps from the App Store search, as competitor suggestions. */
export async function suggestCompetitors(app: Pick<AppProfile, "name" | "oneLiner" | "hashtags" | "appStore">, limit = 8): Promise<Competitor[]> {
  const country = (app.appStore?.country as string) ?? "us";
  const terms = new Set<string>();
  const stop = new Set(["the", "and", "for", "your", "with", "app", "that", "you", "every", "into", "from", "best"]);
  const words = `${app.oneLiner}`.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  const keyWords = words.filter((w) => !stop.has(w)).slice(0, 4);
  if (keyWords.length) terms.add(keyWords.slice(0, 3).join(" "));
  if (keyWords.length > 3) terms.add(keyWords.slice(1, 4).join(" "));
  for (const h of app.hashtags.slice(0, 2)) terms.add(h.replace(/^#/, "").replace(/driver$/, " driver"));
  if (app.appStore?.category) terms.add(`${keyWords[0] ?? ""} ${app.appStore.category}`.trim());
  const seen = new Set<string>([app.name.toLowerCase()]);
  const out: Competitor[] = [];
  for (const term of terms) {
    const r = await itunes(`search?term=${encodeURIComponent(term)}&entity=software&country=${country}&limit=15`);
    for (const a of r.results) {
      const n = (a.trackName as string).toLowerCase();
      if (seen.has(n) || n.includes(app.name.toLowerCase().split(":")[0])) continue;
      seen.add(n);
      out.push({ name: a.trackName, appStoreUrl: a.trackViewUrl, rating: a.averageUserRating, ratingCount: a.userRatingCount, note: a.primaryGenreName });
    }
  }
  // Keep search-relevance order; drop giant platforms (Uber, Lyft…) that show up for every niche term.
  const own = (app.appStore?.ratingCount as number) ?? 0;
  const cap = Math.max(250_000, own * 20);
  return out.filter((c) => (c.ratingCount ?? 0) < cap).slice(0, limit);
}

export const iconExists = (p?: string) => !!p && (/^https?:/.test(p) || fs.existsSync(path.resolve(path.dirname(APPS_DIR), p)));

/** Lookup + merge into an app profile + save icon + competitor suggestions. Shared by dashboard and MCP. */
export async function autofillApp(appStoreUrl: string, slug?: string, overwrite = false) {
  const { getApp, saveApp, APP_QUESTIONS } = await import("./apps.js");
  const store = await lookupApp(appStoreUrl);
  const draft = profileFromStore(store);
  const existing = slug ? getApp(slug) : null;
  const merged: any = { ...draft };
  if (existing && !overwrite) for (const [k, v] of Object.entries(existing)) if (v && (!Array.isArray(v) || v.length)) merged[k] = v;
  merged.appStore = store;
  let app = saveApp({ ...merged, slug: slug ?? existing?.slug, name: existing?.name ?? store.name });
  if (!existing?.icon) {
    const icon = await saveIcon(app.slug, store.iconUrl).catch(() => undefined);
    if (icon) app = saveApp({ slug: app.slug, name: app.name, icon });
  }
  const stillToAsk = APP_QUESTIONS.filter((q) => {
    const v = (app as any)[q.key];
    return !v || (Array.isArray(v) && !v.length);
  }).map((q) => q.q);
  return { app, suggestedCompetitors: await suggestCompetitors(app).catch(() => []), stillToAsk };
}

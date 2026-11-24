// Shows what recent Apify runs cost and why.  npx tsx src/cli/apify-costs.ts
import { requireEnv } from "../config.js";

const h = { Authorization: `Bearer ${requireEnv("APIFY_TOKEN")}` };
const get = (u: string) => fetch(`https://api.apify.com/v2${u}`, { headers: h }).then((r) => r.json() as Promise<any>);

const runs = await get("/actor-runs?desc=1&limit=30");
let total = 0;
for (const r of runs.data.items) {
  const run = (await get(`/actor-runs/${r.id}`)).data;
  const usd: number = run.usageTotalUsd ?? 0;
  total += usd;
  const input = await get(`/key-value-stores/${run.defaultKeyValueStoreId}/records/INPUT`).catch(() => ({}));
  const what = input.hashtags
    ? "hashtags " + input.hashtags.join(",")
    : input.searchQueries
      ? "search " + input.searchQueries.join(",")
      : input.profiles
        ? "profiles " + input.profiles.join(",")
        : input.postURLs
          ? "postURLs x" + input.postURLs.length
          : "?";
  console.log(
    "USD " + usd.toFixed(3),
    "items=" + (run.stats?.itemCount ?? "?"),
    "rpp=" + input.resultsPerPage,
    "imgs=" + input.shouldDownloadSlideshowImages,
    "comments=" + (input.topLevelCommentsPerPost ?? 0),
    what,
  );
  if (run.chargedEventCounts) console.log("      events:", JSON.stringify(run.chargedEventCounts));
}
console.log("TOTAL USD " + total.toFixed(2));
const act = (await get("/acts/clockworks~tiktok-scraper")).data;
const pricing = act?.pricingInfos?.at(-1);
console.log("pricing:", JSON.stringify(pricing?.pricingPerEvent?.actorChargeEvents ?? pricing ?? {}, null, 1).slice(0, 2500));

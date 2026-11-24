// Prints an Apify actor's pricing and input fields.  npx tsx src/cli/actor-info.ts apidojo~tiktok-scraper
import { requireEnv } from "../config.js";

const h = { Authorization: `Bearer ${requireEnv("APIFY_TOKEN")}` };
const get = (u: string) => fetch(`https://api.apify.com/v2${u}`, { headers: h }).then((r) => r.json() as Promise<any>);

for (const actor of process.argv.slice(2)) {
  const a = (await get(`/acts/${actor}`)).data;
  if (!a) {
    console.log(actor, "not found");
    continue;
  }
  console.log(`\n=== ${actor}: ${a.title}  (runs: ${a.stats?.totalRuns ?? "?"})`);
  const p = a.pricingInfos?.at(-1);
  if (p?.pricingModel === "PAY_PER_EVENT") {
    for (const [k, v] of Object.entries<any>(p.pricingPerEvent?.actorChargeEvents ?? {}))
      console.log("  event", k, "FREE-tier USD", v.eventTieredPricingUsd?.FREE?.tieredEventPriceUsd ?? v.eventPriceUsd, "-", v.eventTitle);
  } else console.log("  pricing", JSON.stringify(p ?? {}).slice(0, 400));
  const b = (await get(`/acts/${actor}/builds/default`)).data;
  const schema = typeof b?.inputSchema === "string" ? JSON.parse(b.inputSchema) : b?.actorDefinition?.input;
  console.log("  inputs:", Object.keys(schema?.properties ?? {}).join(", "));
}

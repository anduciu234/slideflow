// Prints input fields with types/enums/defaults.  npx tsx src/cli/actor-schema.ts <actor> [field...]
import { requireEnv } from "../config.js";
const h = { Authorization: `Bearer ${requireEnv("APIFY_TOKEN")}` };
const [actor, ...fields] = process.argv.slice(2);
const b: any = (await fetch(`https://api.apify.com/v2/acts/${actor}/builds/default`, { headers: h }).then((r) => r.json())).data;
const s = typeof b?.inputSchema === "string" ? JSON.parse(b.inputSchema) : b?.actorDefinition?.input;
for (const [k, v] of Object.entries<any>(s?.properties ?? {}))
  if (!fields.length || fields.includes(k))
    console.log(k, "|", v.type, v.enum ? "enum " + JSON.stringify(v.enum) : "", v.default !== undefined ? "default " + JSON.stringify(v.default) : "", "|", (v.description ?? "").replace(/<[^>]+>/g, "").slice(0, 140));

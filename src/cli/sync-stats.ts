// npm run stats [-- <account>] [--scrape|--api] : sync TikTok stats for one or all connected accounts
import { syncStats } from "../stats.js";
import { loadAccounts } from "../tiktok/auth.js";
const args = process.argv.slice(2);
const source = args.includes("--scrape") ? "scrape" : args.includes("--api") ? "api" : "auto";
const names = args.filter((a) => !a.startsWith("--"));
for (const a of names.length ? names : Object.keys(loadAccounts())) {
  const s = await syncStats(a, source);
  console.log(`${a}: ${s.posts.length} posts, ${s.posts.reduce((n, p) => n + p.views, 0)} views (via ${s.source})`);
}

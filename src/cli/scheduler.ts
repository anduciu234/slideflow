/**
 * Fills empty autopilot slots with approved drafts and publishes posts when due.
 *   npm run scheduler        → runs forever (checks every minute, refills slots every 30 min)
 *   npm run scheduler:once   → one pass; for launchd / cron / a server
 */
import { fillSlots } from "../autopilot.js";
import { runDue } from "../queue.js";

const stamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");

function fill() {
  try {
    const r = fillSlots();
    for (const s of r.scheduled) console.log(`[${stamp()}] scheduled ${s.draftId} → ${s.account} at ${s.at}`);
    for (const [a, n] of Object.entries(r.approvedLeft)) if (n === 0) console.log(`[${stamp()}] ${a}: no approved drafts left for upcoming slots`);
  } catch (e) {
    console.error(`[${stamp()}] fill failed:`, (e as Error).message);
  }
}

async function post() {
  try {
    for (const r of await runDue()) console.log(`[${stamp()}] ${r.id} (${r.draftId}) → ${r.status}${r.error ? `: ${r.error}` : ""}`);
  } catch (e) {
    console.error(`[${stamp()}] post failed:`, (e as Error).message);
  }
}

if (process.argv.includes("--once")) {
  fill();
  await post();
} else {
  console.log("Scheduler running. Ctrl+C to stop.");
  fill();
  await post();
  setInterval(post, 60_000);
  setInterval(fill, 30 * 60_000);
}

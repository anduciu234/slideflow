/** Running log of estimated Apify spend, so research costs stay visible. */
import path from "node:path";
import { LIB, readJson, writeJson } from "../config.js";

const FILE = path.join(LIB, "spend.json");

interface SpendEntry {
  at: string;
  actor: string;
  query: unknown;
  rows: number;
  comments: number;
  estUsd: number;
}

export function logSpend(e: Omit<SpendEntry, "at">) {
  const all = readJson<SpendEntry[]>(FILE, []);
  all.push({ at: new Date().toISOString(), ...e, estUsd: +e.estUsd.toFixed(4) });
  writeJson(FILE, all);
  console.error(`[apify] ${e.actor}: ${e.rows} rows, ${e.comments} comments ≈ $${e.estUsd.toFixed(3)}`);
}

export function spendSummary(days = 30) {
  const since = Date.now() - days * 86400_000;
  const recent = readJson<SpendEntry[]>(FILE, []).filter((e) => Date.parse(e.at) >= since);
  return { days, runs: recent.length, estUsd: +recent.reduce((s, e) => s + e.estUsd, 0).toFixed(3) };
}

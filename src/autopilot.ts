/**
 * Autopilot: a posting plan per account (times per day, timezone, mode) that the
 * scheduler fills automatically with approved drafts, then posts at those times.
 *
 *   library/autopilot.json   ← the plan (edit on the dashboard or by hand)
 *   draft.approvedAt         ← drafts you've OK'd (dashboard "Approve")
 *
 * fillSlots() puts the oldest approved, not-yet-used drafts into the next empty
 * slots. runDue() (queue.ts) posts them when due. The scheduler runs both.
 */
import path from "node:path";
import { LIB, PATHS, readJson, writeJson } from "./config.js";
import { getDraft, listDrafts } from "./drafts.js";
import { enqueue, loadQueue } from "./queue.js";
import type { Draft, PostMode } from "./types.js";

const FILE = path.join(LIB, "autopilot.json");

export interface AccountPlan {
  enabled: boolean;
  /** Local times, "HH:MM", one post per time per day. */
  times: string[];
  /** 0=Sun … 6=Sat. Omit for every day. */
  days?: number[];
  mode: PostMode;
  privacy?: string;
  /** true = only drafts you approved get scheduled (recommended). */
  requireApproval: boolean;
  /** Don't post the same draft to this account again. Always on. */
}

export interface AutopilotPlan {
  timezone: string;
  /** How far ahead to fill the calendar. */
  daysAhead: number;
  accounts: Record<string, AccountPlan>;
}

const DEFAULT: AutopilotPlan = { timezone: "Europe/London", daysAhead: 7, accounts: {} };

export const loadPlan = (): AutopilotPlan => ({ ...DEFAULT, ...readJson<Partial<AutopilotPlan>>(FILE, {}) });
export const savePlan = (p: AutopilotPlan) => writeJson(FILE, p);

export function setAccountPlan(account: string, plan: Partial<AccountPlan>, timezone?: string) {
  const p = loadPlan();
  const defaults: AccountPlan = { enabled: true, times: ["08:30", "18:00"], mode: "draft", requireApproval: true };
  p.accounts[account] = { ...defaults, ...p.accounts[account], ...plan };
  if (timezone) p.timezone = timezone;
  for (const t of p.accounts[account].times) if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new Error(`Bad time "${t}" (use HH:MM)`);
  savePlan(p);
  return p;
}

// ---------- approvals ----------
export function setApproved(draftId: string, approved: boolean): Draft {
  const d = getDraft(draftId);
  const next = { ...d, approvedAt: approved ? new Date().toISOString() : undefined };
  writeJson(path.join(PATHS.drafts, `${draftId}.json`), next);
  return next;
}

// ---------- time zones ----------
/** UTC Date for a wall-clock time (YYYY-MM-DD + HH:MM) in an IANA time zone. */
export function zoned(dateISO: string, hhmm: string, tz: string): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  let guess = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 2; i++) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
        .formatToParts(new Date(guess))
        .map((p) => [p.type, p.value]),
    );
    const shown = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    guess += Date.UTC(y, m - 1, d, hh, mm) - shown;
  }
  return new Date(guess);
}

const localDate = (dt: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(dt); // YYYY-MM-DD
const weekday = (dateISO: string) => new Date(dateISO + "T12:00:00Z").getUTCDay();

/** Upcoming slots for an account over the plan horizon, with whatever is already queued in them. */
export function upcomingSlots(account: string, now = new Date()) {
  const plan = loadPlan();
  const ap = plan.accounts[account];
  if (!ap) return [];
  const queue = loadQueue().filter((q) => q.account === account && q.status !== "cancelled");
  const slots: { at: Date; item?: (typeof queue)[number] }[] = [];
  for (let i = 0; i <= plan.daysAhead; i++) {
    const day = localDate(new Date(now.getTime() + i * 86400_000), plan.timezone);
    if (ap.days && !ap.days.includes(weekday(day))) continue;
    for (const t of ap.times) {
      const at = zoned(day, t, plan.timezone);
      if (at.getTime() < now.getTime() + 5 * 60_000) continue; // too soon / past
      // a queue item within 20 min of the slot occupies it
      const item = queue.find((q) => Math.abs(Date.parse(q.scheduledAt) - at.getTime()) < 20 * 60_000);
      slots.push({ at, item });
    }
  }
  return slots.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Fill empty slots with approved drafts not yet used for that account. Returns what was scheduled. */
export function fillSlots(now = new Date(), opts: { dryRun?: boolean; ignoreEnabled?: boolean } = {}) {
  const plan = loadPlan();
  const scheduled: { account: string; draftId: string; at: string }[] = [];
  const waiting: Record<string, number> = {};
  for (const [account, ap] of Object.entries(plan.accounts)) {
    if (!ap.enabled && !opts.ignoreEnabled) continue;
    const used = new Set(loadQueue().filter((q) => q.account === account && q.status !== "cancelled").map((q) => q.draftId));
    const pool = listDrafts()
      .filter((d) => !used.has(d.id) && (!ap.requireApproval || d.approvedAt))
      .sort((a, b) => (a.approvedAt ?? a.createdAt).localeCompare(b.approvedAt ?? b.createdAt));
    for (const slot of upcomingSlots(account, now)) {
      if (slot.item) continue;
      const d = pool.shift();
      if (!d) break;
      if (!opts.dryRun) enqueue({ draftId: d.id, account, scheduledAt: slot.at.toISOString(), mode: ap.mode, privacy: ap.privacy });
      scheduled.push({ account, draftId: d.id, at: slot.at.toISOString() });
    }
    waiting[account] = pool.length;
  }
  return { scheduled, approvedLeft: waiting };
}

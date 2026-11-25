// Rules for nudging learners to leave feedback without nagging them.
// Pure functions (storage and clock are injected) so they can be tested in Node.
//
// State lives only in this browser's localStorage: no Vercel or Supabase calls.
// A learner on a second device can therefore see the card once more.

export const NUDGE_KEY = "iv:fb";
export const SESSION_KEY = "iv:fb-shown";
export const MIN_VISITS_FOR_CARD = 3;
export const SNOOZE_DAYS = 14;
export const SUBMITTED_QUIET_DAYS = 60;
export const CARD_DELAY_MS = 20_000;   // time on a page before the card may appear
export const PULSE_MS = 6_000;         // how long the button pulses after load
const DAY_MS = 86_400_000;

export type NudgeState = {
  visits: number;          // distinct IST days the learner opened the app
  lastVisitDay: string;    // YYYY-MM-DD (IST) of the last counted visit
  snoozeUntil: number;     // epoch ms; card hidden until then ("Not now")
  optOut: boolean;         // "Don't ask again": no card, no pulse
  submittedAt: number;     // epoch ms of the last submitted feedback (0 = never)
};

type Storage = { getItem(k: string): string | null; setItem(k: string, v: string): void };

export const emptyState = (): NudgeState => ({ visits: 0, lastVisitDay: "", snoozeUntil: 0, optOut: false, submittedAt: 0 });

export const istDay = (now: number) => new Date(now).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export function parseState(raw: string | null | undefined): NudgeState {
  const s = emptyState();
  if (!raw) return s;
  try {
    const j = JSON.parse(raw);
    if (Number.isFinite(j?.visits) && j.visits > 0) s.visits = Math.floor(j.visits);
    if (typeof j?.lastVisitDay === "string") s.lastVisitDay = j.lastVisitDay;
    if (Number.isFinite(j?.snoozeUntil)) s.snoozeUntil = j.snoozeUntil;
    if (j?.optOut === true) s.optOut = true;
    if (Number.isFinite(j?.submittedAt)) s.submittedAt = j.submittedAt;
  } catch { /* corrupt value: start fresh */ }
  return s;
}

export function loadState(storage: Storage | null): NudgeState {
  try { return parseState(storage?.getItem(NUDGE_KEY)); } catch { return emptyState(); }
}
export function saveState(storage: Storage | null, s: NudgeState) {
  try { storage?.setItem(NUDGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

// One visit per IST calendar day per browser.
export function recordVisit(s: NudgeState, now: number): NudgeState {
  const day = istDay(now);
  return s.lastVisitDay === day ? s : { ...s, visits: s.visits + 1, lastVisitDay: day };
}

const recentlySubmitted = (s: NudgeState, now: number) =>
  s.submittedAt > 0 && now - s.submittedAt < SUBMITTED_QUIET_DAYS * DAY_MS;

// The button pulses on every visit, except for people who said stop or already gave feedback.
export const pulseActive = (s: NudgeState, now: number) => !s.optOut && !recentlySubmitted(s, now);

// Pages where an interruption is unwelcome (reading a packet, signing in).
export const isQuietPath = (p: string | null | undefined) => !p || p === "/login" || /^\/packets\/[^/]+/.test(p) || p.startsWith("/auth");

export function shouldShowCard(s: NudgeState, now: number, ctx: { shownThisSession: boolean; pathname: string | null | undefined }): boolean {
  if (ctx.shownThisSession) return false;
  if (isQuietPath(ctx.pathname)) return false;
  if (s.optOut) return false;
  if (s.visits < MIN_VISITS_FOR_CARD) return false;
  if (now < s.snoozeUntil) return false;
  if (recentlySubmitted(s, now)) return false;
  return true;
}

export const snooze = (s: NudgeState, now: number): NudgeState => ({ ...s, snoozeUntil: now + SNOOZE_DAYS * DAY_MS });
export const optOutForever = (s: NudgeState): NudgeState => ({ ...s, optOut: true });
export const markSubmitted = (s: NudgeState, now: number): NudgeState => ({ ...s, submittedAt: now });

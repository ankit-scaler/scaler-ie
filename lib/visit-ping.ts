// Visit ping logic, kept free of React/Supabase imports (everything is injected)
// so it can be tested directly in Node.
//
// One "visit" = one row in `sessions` per browser per 5 minutes. That row's
// started_at feeds Daily Visits, the Slack digest, per-learner "last active"
// and the tracking sheet, so those keep working unchanged.

export const SESSION_WINDOW_MS = 5 * 60_000;
export const VISIT_KEY = "iv:last-visit";

type Storage = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };

export type VisitDeps = {
  now: () => number;
  visible: () => boolean;
  storage: Storage | null;                                   // localStorage (null if unavailable)
  getEmail: () => Promise<string | null>;                    // from the local session, no network
  insertSession: (email: string) => Promise<{ error: unknown }>; // direct insert, no Vercel function
  fallback: () => Promise<boolean>;                          // existing /api/heartbeat route
};

export type PingResult = "recorded" | "fallback" | "skipped" | "failed";

export function createVisitPinger(deps: VisitDeps) {
  let memLast = 0; // used when storage is unavailable, and as a same-page guard

  const readLast = () => {
    try {
      const raw = deps.storage?.getItem(VISIT_KEY);
      const n = raw ? Number(raw) : 0;
      return Math.max(Number.isFinite(n) ? n : 0, memLast);
    } catch {
      return memLast;
    }
  };
  const writeLast = (t: number) => {
    memLast = t;
    try { deps.storage?.setItem(VISIT_KEY, String(t)); } catch { /* ignore */ }
  };
  const clearLast = () => {
    memLast = 0;
    try { deps.storage?.removeItem(VISIT_KEY); } catch { /* ignore */ }
  };

  return async function ping(): Promise<PingResult> {
    // Hidden/background tabs never count as a visit.
    if (!deps.visible()) return "skipped";

    const now = deps.now();
    const last = readLast();
    // last > now means the clock moved backwards: ignore the stale value.
    if (last && last <= now && now - last < SESSION_WINDOW_MS) return "skipped";

    // Claim the window first, so a reload or second tab racing us doesn't
    // record the same visit twice.
    writeLast(now);

    try {
      const email = await deps.getEmail();
      if (!email) { clearLast(); return "skipped"; } // signed out: don't use up the window
      const { error } = await deps.insertSession(email);
      if (!error) return "recorded";
    } catch {
      /* fall through to the server route */
    }

    // Direct insert failed (policy missing, expired token, network): use the
    // existing server route once so basic tracking never silently stops.
    let ok = false;
    try { ok = await deps.fallback(); } catch { ok = false; }
    if (ok) return "fallback";
    clearLast(); // let the next page load try again
    return "failed";
  };
}

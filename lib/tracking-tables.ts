// Pure grouping helpers behind the Tracking page's daily tables and CSV exports
// (moved out of components/AdminTracking.tsx unchanged in behaviour, so they can be
// tested in Node). sync/sync_sheet.py has Python twins (build_daily_visitors,
// build_daily_searches, ...) with the same grain, columns and ordering, so a sheet
// tab and its CSV never disagree. All days are IST calendar days.

export function istDateStr(input: string | number | Date): string {
  return new Date(input).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

// Ordinal compare (not localeCompare) so the Python twin sorts identically.
const lt = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export type ViewRow = {
  user_email: string; company: string | null; role: string | null; program: string | null;
  topic: string | null; path: string | null; created_at: string;
};
type EmailTs = { user_email: string; created_at: string };

// A page_views row is either a genuine search/filter-narrow event (has
// company/role/topic set — Questions and Assignments only ever fire /api/track
// this way) or a bare page-visit ping (Jobs, Packets and Company Packets fire
// this on every mount, path set, nothing else). "Daily searches" must only count
// the former, or page visits silently inflate that chart.
export function isSearchView(v: Pick<ViewRow, "company" | "role" | "topic">) {
  return !!(v.company || v.role || v.topic);
}

// Raw (email, date) rows behind a chart's daily unique-count line — "who was
// counted on which day," not just the aggregate. Multiple same-day events from one
// email collapse to a single row, since the chart itself counts a learner once per
// day no matter how many times they did the thing.
export function dailyRows<T>(rows: T[], emailFn: (r: T) => string, dateFn: (r: T) => string): { email: string; date: string }[] {
  const seen = new Set<string>();
  const out: { email: string; date: string }[] = [];
  for (const r of rows) {
    const email = emailFn(r), date = istDateStr(dateFn(r));
    const k = `${email}|${date}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ email, date });
  }
  return out.sort((a, b) => lt(b.date, a.date) || lt(a.email, b.email));
}

export const buildActiveUserRows = (sessions: { user_email: string; started_at: string }[]) =>
  dailyRows(sessions, s => s.user_email, s => s.started_at);

export const buildSearchedUserRows = (views: ViewRow[]) =>
  dailyRows(views.filter(isSearchView), v => v.user_email, v => v.created_at);

export const buildPageVisitRows = (views: ViewRow[], path: string) =>
  dailyRows(views.filter(v => v.path === path), v => v.user_email, v => v.created_at);

export function buildContentEngagementRows(packetViews: EmailTs[], videoViews: EmailTs[]) {
  const packets = dailyRows(packetViews, v => v.user_email, v => v.created_at).map(r => ({ ...r, type: "Read a packet" }));
  const videos  = dailyRows(videoViews,  v => v.user_email, v => v.created_at).map(r => ({ ...r, type: "Watched a video" }));
  return [...packets, ...videos].sort((a, b) => lt(b.date, a.date) || lt(a.email, b.email) || lt(a.type, b.type));
}

// Same per-learner-per-day dedup as dailyRows, plus a third key (job/packet) so
// re-clicking the same item twice in a day collapses to one row, matching the
// jobApplyClicks/companyPacketOpensUnique stat tiles exactly.
export function dailyItemRows<T>(rows: T[], emailFn: (r: T) => string, itemFn: (r: T) => string, dateFn: (r: T) => string): { email: string; item: string; date: string }[] {
  const seen = new Set<string>();
  const out: { email: string; item: string; date: string }[] = [];
  for (const r of rows) {
    const email = emailFn(r), item = itemFn(r), date = istDateStr(dateFn(r));
    const k = `${email}|${item}|${date}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ email, item, date });
  }
  return out.sort((a, b) => lt(b.date, a.date) || lt(a.email, b.email) || lt(a.item, b.item));
}

export const buildJobApplyRows = (jobApplies: { user_email: string; job_id: number; created_at: string }[]) =>
  dailyItemRows(jobApplies, a => a.user_email, a => String(a.job_id), a => a.created_at);

export const buildCompanyPacketOpenRows = (opens: { user_email: string; slug: string; created_at: string }[]) =>
  dailyItemRows(opens, o => o.user_email, o => o.slug, o => o.created_at);

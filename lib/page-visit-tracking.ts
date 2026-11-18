// "Who opened page X" for the admin Tracking page (pure, testable in Node).
// sync/sync_sheet.py has the twin `build_page_visits` with identical columns
// and ordering, so a sheet tab and its CSV export never disagree.

export type PageViewRow = { user_email: string; path: string | null; created_at: string };
export type PageVisitRow = { email: string; first: string; last: string; count: number };

const lt = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0); // ordinal, like Python

// One row per learner for a given page path: first visit, last visit, count.
export function buildPageVisitByEmail(views: PageViewRow[], path: string): PageVisitRow[] {
  const m = new Map<string, PageVisitRow>();
  for (const v of views) {
    if (v.path !== path) continue;
    const r = m.get(v.user_email) || { email: v.user_email, first: v.created_at, last: v.created_at, count: 0 };
    r.count++;
    if (v.created_at < r.first) r.first = v.created_at;
    if (v.created_at > r.last) r.last = v.created_at;
    m.set(v.user_email, r);
  }
  return Array.from(m.values()).sort((a, b) => lt(b.last, a.last) || lt(a.email, b.email));
}

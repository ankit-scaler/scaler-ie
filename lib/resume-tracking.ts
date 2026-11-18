// Read-side helpers for the Resumes section of the admin Tracking page.
// Pure functions (no React, no imports) so they can be tested directly in Node.
// sync/sync_sheet.py has the same builders (build_resume_*) with the same
// columns and ordering, so a sheet tab and its CSV export never disagree.
// Source: the `model_resume_event` table, written by the learner app.

export type ResumeEvent = {
  user_email: string;
  created_at: string;
  slug: string | null;
  kind: string;                         // resume_view | note_open | see_example | filter | pdf_download | mentor_cta | mentor_dashboard_cta | list_view
  detail: Record<string, unknown> | null;
  program: string | null;               // joined from model_resume
  exp_label: string | null;
  background_label: string | null;
};

export const EXP_LABELS: Record<string, string> = {
  fresher: "Fresher (under 1 yr)", "1-4": "1–4 yrs", "5-10": "5–10 yrs", "10plus": "10+ yrs",
};
export const BG_LABELS: Record<string, string> = {
  cs: "CS/IT degree", noncs: "Non-CS degree", same: "Same domain",
  different: "Different tech domain", switcher: "Switching from non-tech",
};
const facet = (map: Record<string, string>, v: unknown) => {
  const s = typeof v === "string" ? v : "";
  return !s || s === "All" ? "All" : (map[s] ?? s);
};

// "DSML · 5–10 yrs · Switching from non-tech"; falls back to the slug if the
// resume row can't be joined (e.g. it was later removed).
export function resumeName(e: Pick<ResumeEvent, "slug" | "program" | "exp_label" | "background_label">): string {
  return e.program ? `${e.program} · ${e.exp_label ?? "—"} · ${e.background_label ?? "—"}` : (e.slug || "—");
}

// Ordinal compare (not localeCompare) so the Python twin sorts identically.
const lt = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byLastDesc = <T extends { email: string; last: string }>(a: T, b: T) => lt(b.last, a.last) || lt(a.email, b.email);

type Acc = { count: number; first: string; last: string };
function touch(m: Map<string, Acc>, key: string, ts: string) {
  const e = m.get(key) || { count: 0, first: ts, last: ts };
  e.count++;
  if (ts < e.first) e.first = ts;
  if (ts > e.last) e.last = ts;
  m.set(key, e);
}

// ---- 1. Who opened what ---------------------------------------------------
export type ResumeOpenRow = { email: string; resume: string; first: string; last: string; count: number };
function perResume(events: ResumeEvent[], kind: string): ResumeOpenRow[] {
  const m = new Map<string, Acc>();
  events.filter(e => e.kind === kind).forEach(e => touch(m, `${e.user_email}\u0000${resumeName(e)}`, e.created_at));
  return Array.from(m.entries())
    .map(([k, v]) => { const [email, resume] = k.split("\u0000"); return { email, resume, ...v }; })
    .sort((a, b) => byLastDesc(a, b) || lt(a.resume, b.resume));
}
export const buildResumeOpens = (events: ResumeEvent[]) => perResume(events, "resume_view");
// ---- 4. Who downloaded ----------------------------------------------------
export const buildResumeDownloads = (events: ResumeEvent[]) => perResume(events, "pdf_download");

// ---- 2. Clicks on resumes (notes + "See it in this resume") ---------------
export type ResumeClickRow = { email: string; resume: string; notes: number; examples: number; last: string };
export function buildResumeClicks(events: ResumeEvent[]): ResumeClickRow[] {
  const m = new Map<string, ResumeClickRow>();
  events.filter(e => e.kind === "note_open" || e.kind === "see_example").forEach(e => {
    const resume = resumeName(e);
    const k = `${e.user_email}\u0000${resume}`;
    const r = m.get(k) || { email: e.user_email, resume, notes: 0, examples: 0, last: e.created_at };
    if (e.kind === "note_open") r.notes++; else r.examples++;
    if (e.created_at > r.last) r.last = e.created_at;
    m.set(k, r);
  });
  return Array.from(m.values()).sort((a, b) => byLastDesc(a, b) || lt(a.resume, b.resume));
}

// ---- 3. Filters applied ---------------------------------------------------
export type ResumeFilterRow = { email: string; programme: string; experience: string; background: string; first: string; last: string; count: number };
export function buildResumeFilters(events: ResumeEvent[]): ResumeFilterRow[] {
  const m = new Map<string, Acc>();
  events.filter(e => e.kind === "filter").forEach(e => {
    const d = e.detail || {};
    const p = typeof d.program === "string" && d.program ? d.program : "All";
    const x = facet(EXP_LABELS, d.band), b = facet(BG_LABELS, d.bg);
    touch(m, [e.user_email, p, x, b].join("\u0000"), e.created_at);
  });
  return Array.from(m.entries())
    .map(([k, v]) => { const [email, programme, experience, background] = k.split("\u0000"); return { email, programme, experience, background, ...v }; })
    .sort((a, b) => byLastDesc(a, b) || lt(a.programme, b.programme) || lt(a.experience, b.experience) || lt(a.background, b.background));
}

// ---- 5. Book a resume review ---------------------------------------------
export type ResumeReviewRow = { email: string; resume: string; header: number; end: number; dashboard: number; last: string };
export function buildResumeReviewClicks(events: ResumeEvent[]): ResumeReviewRow[] {
  const m = new Map<string, ResumeReviewRow>();
  events.filter(e => e.kind === "mentor_cta" || e.kind === "mentor_dashboard_cta").forEach(e => {
    const resume = resumeName(e);
    const k = `${e.user_email}\u0000${resume}`;
    const r = m.get(k) || { email: e.user_email, resume, header: 0, end: 0, dashboard: 0, last: e.created_at };
    if (e.kind === "mentor_dashboard_cta") r.dashboard++;
    else if ((e.detail || {}).from === "end") r.end++;
    else r.header++;
    if (e.created_at > r.last) r.last = e.created_at;
    m.set(k, r);
  });
  return Array.from(m.values()).sort((a, b) => byLastDesc(a, b) || lt(a.resume, b.resume));
}

// ---- stat tiles -----------------------------------------------------------
export function resumeStats(events: ResumeEvent[]) {
  const count = (k: string) => events.filter(e => e.kind === k).length;
  return {
    openers: new Set(events.filter(e => e.kind === "resume_view").map(e => e.user_email)).size,
    opens: count("resume_view"),
    notes: count("note_open"),
    filters: count("filter"),
    downloads: count("pdf_download"),
    reviewClicks: count("mentor_cta"),
    dashboardClicks: count("mentor_dashboard_cta"),
  };
}

// ---- Learner Lookup timeline ---------------------------------------------
export function resumeTimelineRows(events: ResumeEvent[], email: string): { when: string; type: string; detail: string }[] {
  const em = email.trim().toLowerCase();
  const out: { when: string; type: string; detail: string }[] = [];
  events.filter(e => e.user_email.toLowerCase() === em).forEach(e => {
    const d = e.detail || {};
    const name = resumeName(e);
    switch (e.kind) {
      case "resume_view": out.push({ when: e.created_at, type: "Opened resume", detail: name }); break;
      case "note_open": out.push({ when: e.created_at, type: "Opened a resume note", detail: name }); break;
      case "see_example": out.push({ when: e.created_at, type: "Clicked \"See it in this resume\"", detail: name }); break;
      case "pdf_download": out.push({ when: e.created_at, type: "Downloaded resume PDF", detail: name }); break;
      case "mentor_cta": out.push({ when: e.created_at, type: "Clicked Book a resume review", detail: `${name} (${d.from === "end" ? "end of page" : "header"})` }); break;
      case "mentor_dashboard_cta": out.push({ when: e.created_at, type: "Went to Scaler dashboard to book review", detail: name }); break;
      case "filter":
        out.push({ when: e.created_at, type: "Filtered resumes", detail: [
          typeof d.program === "string" && d.program ? d.program : "All", facet(EXP_LABELS, d.band), facet(BG_LABELS, d.bg),
        ].join(" · ") });
        break;
      default: break; // list_view etc. are not shown in the timeline
    }
  });
  return out;
}

"use client";
import { useEffect, useMemo, useState } from "react";
import JobRow from "./JobRow";
import FilterBar, { EmptyState } from "./FilterBar";
import { useUrlState } from "@/lib/useUrlState";

export type Job = {
  id: number;
  site: string;
  title: string;
  company: string;
  location: string | null;
  is_remote: boolean;
  job_type: string | null;
  date_posted: string | null;
  job_url: string;
  search_role: string;
};

const PAGE = 30;

// JobSpy returns raw board text ("Bengaluru, Karnataka…", "Gurugram,
// Haryana…"), not the city names users type, so filtering needs the
// common alternate spellings per city, not just the display label.
const CITIES: { label: string; match: string[] }[] = [
  { label: "Bangalore", match: ["bangalore", "bengaluru"] },
  { label: "Hyderabad", match: ["hyderabad"] },
  { label: "Pune", match: ["pune"] },
  { label: "Gurgaon", match: ["gurgaon", "gurugram"] },
  { label: "Mumbai", match: ["mumbai"] },
  { label: "Chennai", match: ["chennai"] },
];
// Derived from the title, since no scraped field gives a role category —
// checked in this order so a more specific term wins over a generic one
// (e.g. "Engineering Manager" lands in Manager, not Engineering).
const ROLE_CATEGORIES: { label: string; match: string[] }[] = [
  { label: "Product", match: ["product"] },
  { label: "Program", match: ["program"] },
  { label: "Manager", match: ["manager", "lead", "head of"] },
  { label: "Data", match: ["data analyst", "data scientist", "data engineer"] },
  { label: "Engineering", match: ["engineer", "developer", "sde", "swe"] },
];
const OTHER_CATEGORY = "Other";

function categoryOf(title: string): string {
  const t = title.toLowerCase();
  for (const c of ROLE_CATEGORIES) {
    if (c.match.some(k => t.includes(k))) return c.label;
  }
  return OTHER_CATEGORY;
}

const JOB_TYPE_LABELS: Record<string, string> = {
  fulltime: "Full-time", parttime: "Part-time", internship: "Internship",
  contract: "Contract", temporary: "Temporary", perdiem: "Per diem",
  volunteer: "Volunteer", other: "Other",
};
// No "Last 30 days" option — the data itself is already hard-capped to a
// 7-day window (see app/jobs/page.tsx), so that option would always be
// identical to "Any time" and misleadingly imply older jobs could exist.
const POSTED_WITHIN = [
  { label: "Any time", days: null as number | null },
  { label: "Last 24 hours", days: 1 },
  { label: "Last 7 days", days: 7 },
];

// Kept in the URL (?q=…&location=…&remoteOnly=1) so a filtered list can be
// linked to — e.g. "open jobs at <company>" from a company packet.
type State = { q: string; location: string; remoteOnly: boolean; jobType: string; category: string; postedDays: number | null };
const DEFAULT_STATE: State = { q: "", location: "All", remoteOnly: false, jobType: "All", category: "All", postedDays: null };

// date_posted is a date (no time), so it parses at UTC midnight. Comparing
// it against `Date.now() - N*86400000` traps "today's" postings in the
// empty state for most of the day in timezones ahead of UTC (e.g. a job
// dated today stops passing "last 24 hours" at 00:00 UTC = 05:30 IST).
// Comparing whole UTC calendar days instead means "last 24 hours" reads as
// "posted today" and "last 7 days" as "within the last 7 calendar days" —
// coarser than true elapsed hours, but never wrongly empty.
function daysSincePosted(dateIso: string): number {
  const posted = new Date(dateIso);
  const postedUTC = Date.UTC(posted.getUTCFullYear(), posted.getUTCMonth(), posted.getUTCDate());
  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((todayUTC - postedUTC) / 86400000);
}

function matchesLocation(job: Job, selected: string): boolean {
  if (selected === "Remote") return job.is_remote;
  const city = CITIES.find(c => c.label === selected);
  if (!city) return true;
  const loc = (job.location || "").toLowerCase();
  return city.match.some(alias => loc.includes(alias));
}

export default function JobsView({ initial }: { initial: Job[] }) {
  const [state, setState] = useUrlState<State>(DEFAULT_STATE);
  const [visible, setVisible] = useState(PAGE);

  // One page-visit event per mount — the Tracking page dedupes this to
  // "unique learners per day" at read time, same pattern as Questions'/
  // Assignments' search-narrow tracking, just unconditional instead of
  // gated on a filter being set (there's no equivalent "action" to gate
  // Jobs' visit count on).
  useEffect(() => {
    fetch("/api/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "/jobs" }),
    }).catch(() => {});
  }, []);

  const jobTypes = useMemo(
    () => Array.from(new Set(initial.map(j => j.job_type).filter((t): t is string => !!t))).sort(),
    [initial]
  );
  const categories = useMemo(
    () => ROLE_CATEGORIES.map(c => c.label).filter(label => initial.some(j => categoryOf(j.title) === label)),
    [initial]
  );

  // The 300 most-listed companies, as search suggestions.
  const topCompanies = useMemo(() => {
    const m = new Map<string, number>();
    initial.forEach(j => m.set(j.company, (m.get(j.company) || 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 300);
  }, [initial]);
  const active = JSON.stringify(state) !== JSON.stringify(DEFAULT_STATE);

  const filtered = useMemo(() => {
    const qL = state.q.trim().toLowerCase();
    return initial
      .filter(j => {
        if (qL && !`${j.title} ${j.company}`.toLowerCase().includes(qL)) return false;
        if (state.remoteOnly && !j.is_remote) return false;
        if (state.location !== "All" && !matchesLocation(j, state.location)) return false;
        if (state.jobType !== "All" && j.job_type !== state.jobType) return false;
        if (state.category !== "All" && categoryOf(j.title) !== state.category) return false;
        if (state.postedDays != null && (!j.date_posted || daysSincePosted(j.date_posted) >= state.postedDays)) return false;
        return true;
      })
      // Newest first — without this, rows render in id-insertion order,
      // which within a sync run means the last search combo processed
      // (not the most recently posted job) ends up on top.
      .sort((a, b) => (b.date_posted || "").localeCompare(a.date_posted || ""));
  }, [initial, state]);

  useEffect(() => setVisible(PAGE), [state]);

  return (
    <div className="space-y-8">
      <section>
        <span className="font-mono text-[11px] uppercase tracking-widest text-mute">Open Hirings</span>
        <h1 className="mt-1 font-display text-4xl leading-tight sm:text-5xl">
          Get Hired by<br /><span className="text-mute">Top Companies</span>
        </h1>
        <p className="mt-3 text-sm text-mute">
          These jobs are sourced from external hiring platforms and not directly linked with Scaler Careerhub.
        </p>
      </section>

      <FilterBar
        search={state.q}
        onSearch={q => setState(s => ({ ...s, q }))}
        placeholder="Search a role or company"
        suggestions={topCompanies.map(([c, n]) => ({
          group: "Companies", value: c, count: n,
          onPick: () => setState(s => ({ ...s, q: c })),
        }))}
        facets={[
          { key: "location", label: "Location", value: state.location, searchable: false,
            options: [{ value: "Remote" }, ...CITIES.map(c => ({ value: c.label }))],
            onChange: v => setState(s => ({ ...s, location: v })) },
          { key: "category", label: "Role", value: state.category, searchable: false,
            options: categories.map(c => ({ value: c })),
            onChange: v => setState(s => ({ ...s, category: v })) },
          { key: "jobType", label: "Job type", value: state.jobType, searchable: false,
            options: jobTypes.map(t => ({ value: t, label: JOB_TYPE_LABELS[t] || t })),
            onChange: v => setState(s => ({ ...s, jobType: v })) },
          { key: "posted", label: "Posted", value: state.postedDays === null ? "All" : String(state.postedDays), searchable: false,
            options: POSTED_WITHIN.filter(p => p.days !== null).map(p => ({ value: String(p.days), label: p.label })),
            onChange: v => setState(s => ({ ...s, postedDays: v === "All" ? null : Number(v) })) },
        ]}
        extra={
          <button
            type="button"
            onClick={() => setState(s => ({ ...s, remoteOnly: !s.remoteOnly }))}
            aria-pressed={state.remoteOnly}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors duration-200 ${
              state.remoteOnly ? "border-acad/50 bg-acad/10 text-text" : "border-edge bg-panel text-mute hover:border-text/40 hover:text-text"
            }`}
          >Remote only</button>
        }
        onClearAll={() => setState(DEFAULT_STATE)}
      />

      <section>
        <div className="mb-3 font-mono text-sm text-mute">
          {filtered.length.toLocaleString()} job{filtered.length === 1 ? "" : "s"}
        </div>
        {filtered.length === 0 ? (
          <EmptyState onClear={active ? () => setState(DEFAULT_STATE) : undefined} />
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.slice(0, visible).map((j, i) => <JobRow key={j.id} job={j} category={categoryOf(j.title)} index={i} />)}
          </div>
        )}
        {visible < filtered.length && (
          <div className="mt-8 text-center">
            <button
              onClick={() => setVisible(v => v + PAGE)}
              className="rounded-full border border-edge bg-panel px-5 py-2.5 text-sm text-text transition hover:border-text/40"
            >Load more</button>
          </div>
        )}
      </section>
    </div>
  );
}

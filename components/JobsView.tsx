"use client";
import { useEffect, useMemo, useState } from "react";
import JobRow from "./JobRow";

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
const POSTED_WITHIN = [
  { label: "Any time", days: null as number | null },
  { label: "Last 24 hours", days: 1 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
];

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
  const [state, setState] = useState<State>(DEFAULT_STATE);
  const [visible, setVisible] = useState(PAGE);

  const jobTypes = useMemo(
    () => Array.from(new Set(initial.map(j => j.job_type).filter((t): t is string => !!t))).sort(),
    [initial]
  );
  const categories = useMemo(
    () => ROLE_CATEGORIES.map(c => c.label).filter(label => initial.some(j => categoryOf(j.title) === label)),
    [initial]
  );

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
        <span className="font-mono text-[11px] uppercase tracking-widest text-mute">Apply to jobs</span>
        <h1 className="mt-1 font-display text-4xl leading-tight sm:text-5xl">
          Get Hired by<br /><span className="text-mute">Top Companies</span>
        </h1>
      </section>

      <section className="flex flex-wrap gap-3">
        <input
          value={state.q}
          onChange={e => setState(s => ({ ...s, q: e.target.value }))}
          placeholder="Search role or company…"
          className="min-w-[200px] flex-1 rounded-xl border border-edge bg-panel px-4 py-2 text-sm text-text placeholder:text-mute focus:border-acad/50 focus:outline-none"
        />
        <select
          value={state.location}
          onChange={e => setState(s => ({ ...s, location: e.target.value }))}
          className="rounded-xl border border-edge bg-panel px-3 py-2 text-sm text-text"
        >
          <option value="All">All locations</option>
          <option value="Remote">Remote</option>
          {CITIES.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
        </select>
        <select
          value={state.category}
          onChange={e => setState(s => ({ ...s, category: e.target.value }))}
          className="rounded-xl border border-edge bg-panel px-3 py-2 text-sm text-text"
        >
          <option value="All">All roles</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={state.jobType}
          onChange={e => setState(s => ({ ...s, jobType: e.target.value }))}
          className="rounded-xl border border-edge bg-panel px-3 py-2 text-sm text-text"
        >
          <option value="All">All job types</option>
          {jobTypes.map(t => <option key={t} value={t}>{JOB_TYPE_LABELS[t] || t}</option>)}
        </select>
        <select
          value={state.postedDays ?? "any"}
          onChange={e => setState(s => ({ ...s, postedDays: e.target.value === "any" ? null : Number(e.target.value) }))}
          className="rounded-xl border border-edge bg-panel px-3 py-2 text-sm text-text"
        >
          {POSTED_WITHIN.map(p => <option key={p.label} value={p.days ?? "any"}>{p.label}</option>)}
        </select>
        <label className="flex items-center gap-2 rounded-xl border border-edge bg-panel px-3 py-2 text-sm text-mute">
          <input
            type="checkbox"
            checked={state.remoteOnly}
            onChange={e => setState(s => ({ ...s, remoteOnly: e.target.checked }))}
          />
          Remote only
        </label>
      </section>

      <section>
        <div className="mb-3 font-mono text-sm text-mute">
          {filtered.length.toLocaleString()} job{filtered.length === 1 ? "" : "s"}
        </div>
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-edge bg-panel p-10 text-center text-mute">
            Nothing matches these filters yet.
          </div>
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

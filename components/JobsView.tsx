"use client";
import { useMemo, useState } from "react";
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

const CITIES = ["Bangalore", "Hyderabad", "Pune", "Gurgaon", "Mumbai", "Chennai"];
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

type State = { q: string; location: string; remoteOnly: boolean; jobType: string; postedDays: number | null };
const DEFAULT_STATE: State = { q: "", location: "All", remoteOnly: false, jobType: "All", postedDays: null };

export default function JobsView({ initial }: { initial: Job[] }) {
  const [state, setState] = useState<State>(DEFAULT_STATE);

  const jobTypes = useMemo(
    () => Array.from(new Set(initial.map(j => j.job_type).filter((t): t is string => !!t))).sort(),
    [initial]
  );

  const filtered = useMemo(() => {
    const qL = state.q.trim().toLowerCase();
    const cutoff = state.postedDays != null ? Date.now() - state.postedDays * 86400000 : null;
    return initial.filter(j => {
      if (qL && !`${j.title} ${j.company}`.toLowerCase().includes(qL)) return false;
      if (state.remoteOnly && !j.is_remote) return false;
      if (state.location !== "All") {
        if (state.location === "Remote") {
          if (!j.is_remote) return false;
        } else if (!(j.location || "").toLowerCase().includes(state.location.toLowerCase())) {
          return false;
        }
      }
      if (state.jobType !== "All" && j.job_type !== state.jobType) return false;
      if (cutoff != null && (!j.date_posted || new Date(j.date_posted).getTime() < cutoff)) return false;
      return true;
    });
  }, [initial, state]);

  return (
    <div className="space-y-8">
      <section>
        <span className="font-mono text-[11px] uppercase tracking-widest text-mute">Apply to jobs</span>
        <h1 className="mt-1 font-display text-4xl leading-tight sm:text-5xl">
          Open roles,<br /><span className="text-mute">refreshed daily.</span>
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
          {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
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
            {filtered.map((j, i) => <JobRow key={j.id} job={j} index={i} />)}
          </div>
        )}
      </section>
    </div>
  );
}

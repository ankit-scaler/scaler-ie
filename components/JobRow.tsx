"use client";
import Link from "next/link";
import { motion } from "framer-motion";

const JOB_TYPE_LABELS: Record<string, string> = {
  fulltime: "Full-time", parttime: "Part-time", internship: "Internship",
  contract: "Contract", temporary: "Temporary", perdiem: "Per diem",
  volunteer: "Volunteer", other: "Other",
};

// Accent-rail color per role category — matches the category filter in
// JobsView.tsx, so the left edge lets you scan the list by category before
// reading a single title.
const CATEGORY_COLORS: Record<string, string> = {
  Engineering: "acad",
  Manager: "dsml",
  Program: "devops",
  Product: "topic",
  Data: "aiml",
};

function timeAgo(dateIso: string | null): string {
  if (!dateIso) return "";
  const days = Math.floor((Date.now() - new Date(dateIso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

export default function JobRow({
  job, category, index, prepHref,
}: {
  job: { id: number; title: string; company: string; location: string | null; is_remote: boolean; job_type: string | null; date_posted: string | null; job_url: string };
  category: string;
  index: number;
  prepHref?: string;
}) {
  const color = CATEGORY_COLORS[category]; // undefined (e.g. "Other") falls back to a neutral rail
  const trackApply = () =>
    fetch("/api/track-job-apply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ job_id: job.id }) }).catch(() => {});

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.015, 0.3) }}
      style={{ borderLeftColor: color ? `rgb(var(--${color}))` : "rgb(var(--edge-strong))" }}
      className="group relative flex w-full flex-col gap-3 overflow-hidden rounded-2xl border border-edge border-l-4 bg-panel p-5 shadow-card transition-shadow hover:shadow-cardH sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <div className="font-display text-lg font-semibold leading-snug">{job.title}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-mute">
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={color ? { color: `rgb(var(--${color}))`, backgroundColor: `rgb(var(--${color}) / 0.12)` } : { color: "rgb(var(--mute))", backgroundColor: "rgb(var(--panel2))" }}
          >{category}</span>
          <span className="text-text">{job.company}</span>
          {job.location && <span>· {job.location}</span>}
          {job.is_remote && (
            <span className="rounded-full border border-acad/30 bg-acad/10 px-2.5 py-0.5 text-xs text-acad">Remote</span>
          )}
          {job.job_type && (
            <span className="rounded-full border border-edge-strong px-2.5 py-0.5 text-xs text-mute">
              {JOB_TYPE_LABELS[job.job_type] || job.job_type}
            </span>
          )}
          {job.date_posted && <span className="text-xs">Posted {timeAgo(job.date_posted)}</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
      {prepHref && (
        <Link
          href={prepHref}
          className="inline-flex items-center gap-2 rounded-xl border border-edge bg-panel2 px-3.5 py-2 text-sm text-text transition hover:border-text/40"
        >Prepare</Link>
      )}
      <a
        href={job.job_url}
        target="_blank" rel="noopener noreferrer"
        onClick={trackApply}
        className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-text px-3.5 py-2 text-sm font-medium text-ink transition hover:opacity-90"
      >
        Apply
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M7 3h10v10h-2V6.4L4.7 16.7 3.3 15.3 13.6 5H7V3z"/></svg>
      </a>
      </div>
    </motion.article>
  );
}

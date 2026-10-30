"use client";
import { motion } from "framer-motion";

const JOB_TYPE_LABELS: Record<string, string> = {
  fulltime: "Full-time", parttime: "Part-time", internship: "Internship",
  contract: "Contract", temporary: "Temporary", perdiem: "Per diem",
  volunteer: "Volunteer", other: "Other",
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
  job, index,
}: {
  job: { id: number; title: string; company: string; location: string | null; is_remote: boolean; job_type: string | null; date_posted: string | null; job_url: string };
  index: number;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.015, 0.3) }}
      className="group relative flex w-full flex-col gap-3 overflow-hidden rounded-2xl border border-edge bg-panel p-5 shadow-card transition-shadow hover:shadow-cardH sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-acad/60 to-transparent" />
      <div className="min-w-0">
        <div className="font-display text-lg leading-snug">{job.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-mute">
          <span className="text-text">{job.company}</span>
          {job.location && <span>· {job.location}</span>}
          {job.is_remote && (
            <span className="rounded-full border border-acad/30 bg-acad/10 px-2.5 py-0.5 text-xs text-acad">Remote</span>
          )}
          {job.job_type && (
            <span className="rounded-full border border-dsml/30 bg-dsml/10 px-2.5 py-0.5 text-xs text-dsml">
              {JOB_TYPE_LABELS[job.job_type] || job.job_type}
            </span>
          )}
          {job.date_posted && <span className="text-xs">Posted {timeAgo(job.date_posted)}</span>}
        </div>
      </div>
      <a
        href={job.job_url}
        target="_blank" rel="noopener noreferrer"
        className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-edge bg-panel2 px-3.5 py-2 text-sm text-text transition hover:border-text/40"
      >
        Apply
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M7 3h10v10h-2V6.4L4.7 16.7 3.3 15.3 13.6 5H7V3z"/></svg>
      </a>
    </motion.article>
  );
}

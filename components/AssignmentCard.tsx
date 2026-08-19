"use client";
import { motion } from "framer-motion";

export default function AssignmentCard({
  a, index,
}: {
  a: { id: number; program: string | null; company: string; role: string; round: string | null; link: string | null };
  index: number;
}) {
  const hasLink = a.link && /^https?:\/\//i.test(a.link);
  const trackOpen = () =>
    fetch("/api/track-assignment", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assignment_id: a.id }) }).catch(() => {});
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.02, 0.3) }}
      whileHover={{ y: -3 }}
      className="group relative overflow-hidden rounded-2xl border border-edge bg-panel p-5 shadow-card transition-shadow hover:shadow-cardH"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-aiml/60 to-transparent" />
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {a.program && <span className="rounded-full border border-edge bg-panel2 px-2.5 py-0.5 font-mono text-mute">{a.program}</span>}
        <span className="rounded-full border border-edge bg-panel2 px-2.5 py-0.5 font-mono">{a.company.trim()}</span>
        <span className="rounded-full border border-edge bg-panel2 px-2.5 py-0.5 font-mono text-mute">{a.role.trim()}</span>
        {a.round && <span className="rounded-full border border-edge bg-panel2 px-2.5 py-0.5 font-mono text-mute">{a.round}</span>}
      </div>
      <div className="mb-4 font-display text-lg leading-snug">{a.company.trim()} — {a.role.trim()}</div>
      {hasLink ? (
        <a
          href={a.link!}
          target="_blank" rel="noreferrer"
          onClick={trackOpen}
          className="inline-flex items-center gap-2 rounded-xl border border-edge bg-panel2 px-3.5 py-2 text-sm text-text transition hover:border-text/40"
        >
          Open assignment
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M7 3h10v10h-2V6.4L4.7 16.7 3.3 15.3 13.6 5H7V3z"/></svg>
        </a>
      ) : (
        <span className="inline-flex items-center gap-2 rounded-xl border border-edge/60 bg-panel2/50 px-3.5 py-2 text-sm text-mute">
          Link not available
        </span>
      )}
    </motion.article>
  );
}

"use client";
import { motion } from "framer-motion";

const BAR: Record<string, string> = {
  Academy: "bg-acad", DSML: "bg-dsml", AIML: "bg-aiml", DevOps: "bg-devops",
};
const DOT = BAR;
const TOPIC_TEXT: Record<string, string> = {
  Academy: "text-acad", DSML: "text-dsml", AIML: "text-aiml", DevOps: "text-devops",
};

// "2026-10-14" → "Oct 2026". Parsed as a plain date so no timezone can
// shift it into the previous month.
function askedLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
  return month ? `${month} ${y}` : "";
}

export default function QuestionCard({
  q, index,
}: {
  q: {
    id: number; program: string; company: string; role: string;
    round: string | null; question: string; related_topic: string | null;
    topic_ai: string | null; asked_on?: string | null;
  };
  index: number;
}) {
  const prog = q.program in BAR ? q.program : "Academy";
  const topic = q.topic_ai || q.related_topic;
  // Company · role · round as one quiet line instead of four coloured
  // pills — the programme keeps its colour; the rest is just context.
  const meta = [q.role.trim(), q.round].filter(Boolean).join(" · ");
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.02, 0.3) }}
      whileHover={{ y: -3 }}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-edge bg-panel p-5 shadow-card transition-shadow hover:shadow-cardH"
    >
      <div className={`absolute inset-x-0 top-0 h-[3px] ${BAR[prog]}`} />
      <div className="mb-3 space-y-1">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className={`inline-flex items-center gap-1.5 font-medium ${TOPIC_TEXT[prog]}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${DOT[prog]}`} />{q.program}
          </span>
          {q.asked_on && askedLabel(q.asked_on) && (
            <span className="font-mono text-mute">Asked {askedLabel(q.asked_on)}</span>
          )}
        </div>
        <div className="text-sm">
          <span className="font-medium text-text">{q.company.trim()}</span>
          {meta && <span className="text-mute"> · {meta}</span>}
        </div>
      </div>
      <p className="whitespace-pre-wrap break-words text-base leading-relaxed text-text">{q.question}</p>
      {topic && (
        <div className="mt-auto flex items-start gap-2 border-t border-edge/60 pt-3 text-sm text-mute">
          <span className={`shrink-0 font-mono uppercase tracking-widest text-[11px] ${TOPIC_TEXT[prog]}`}>Topic</span>
          <span className="break-words text-text/80">{topic}</span>
        </div>
      )}
    </motion.article>
  );
}

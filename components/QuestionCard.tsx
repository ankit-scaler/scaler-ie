"use client";
import { motion } from "framer-motion";
import Monogram, { Tone } from "./Monogram";

const BAR: Record<string, string> = {
  Academy: "bg-acad", DSML: "bg-dsml", AIML: "bg-aiml", DevOps: "bg-devops", FDE: "bg-topic",
};
const DOT = BAR;
const TONE: Record<string, Tone> = {
  Academy: "acad", DSML: "dsml", AIML: "aiml", DevOps: "devops", FDE: "topic",
};
const TOPIC_TEXT: Record<string, string> = {
  Academy: "text-acad", DSML: "text-dsml", AIML: "text-aiml", DevOps: "text-devops", FDE: "text-topic",
};

export default function QuestionCard({
  q, index,
}: {
  q: {
    id: number; program: string; company: string; role: string;
    round: string | null; question: string; related_topic: string | null;
    topic_ai: string | null;
  };
  index: number;
}) {
  const prog = q.program in BAR ? q.program : "Academy";
  const topic = q.topic_ai || q.related_topic;
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.02, 0.3) }}
      whileHover={{ y: -3 }}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-edge bg-panel p-5 shadow-card transition-shadow hover:shadow-cardH"
    >
      <div className="mb-4 flex items-center gap-3">
        <Monogram name={q.company} tone={TONE[prog]} />
        <div className="min-w-0">
          <div className="break-words font-display text-base font-semibold leading-tight">{q.company.trim()}</div>
          <div className="break-words text-sm text-mute">{q.role.trim()}{q.round ? ` · ${q.round}` : ""}</div>
        </div>
        <span className={`ml-auto inline-flex shrink-0 items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider ${TOPIC_TEXT[prog]}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${DOT[prog]}`} />{q.program}
        </span>
      </div>
      <p className="whitespace-pre-wrap break-words text-[15.5px] leading-relaxed text-text">{q.question}</p>
      {topic && (
        <div className="mt-4 flex items-start gap-2 border-t border-edge/60 pt-3 text-sm text-mute">
          <span className={`shrink-0 font-mono uppercase tracking-widest text-[11px] ${TOPIC_TEXT[prog]}`}>Topic</span>
          <span className="break-words text-text/80">{topic}</span>
        </div>
      )}
    </motion.article>
  );
}

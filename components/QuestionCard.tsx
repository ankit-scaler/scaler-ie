"use client";
import { motion } from "framer-motion";

const BAR: Record<string, string> = {
  Academy: "bg-acad", DSML: "bg-dsml", AIML: "bg-aiml", DevOps: "bg-devops",
};
const DOT = BAR;
const BADGE: Record<string, string> = {
  Academy: "border-acad/30 bg-acad/10 text-acad",
  DSML:    "border-dsml/30 bg-dsml/10 text-dsml",
  AIML:    "border-aiml/30 bg-aiml/10 text-aiml",
  DevOps:  "border-devops/30 bg-devops/10 text-devops",
};
const TOPIC_TEXT: Record<string, string> = {
  Academy: "text-acad", DSML: "text-dsml", AIML: "text-aiml", DevOps: "text-devops",
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
      <div className={`absolute inset-x-0 top-0 h-[3px] ${BAR[prog]}`} />
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium ${BADGE[prog]}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${DOT[prog]}`} />{q.program}
        </span>
        <span className="rounded-full border border-acad/30 bg-acad/10 px-3 py-1 text-acad">{q.company.trim()}</span>
        <span className="rounded-full border border-dsml/30 bg-dsml/10 px-3 py-1 text-dsml">{q.role.trim()}</span>
        {q.round && <span className="rounded-full border border-aiml/30 bg-aiml/10 px-3 py-1 text-aiml">{q.round}</span>}
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

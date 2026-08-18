"use client";
import { motion } from "framer-motion";

const PROG_COLOR: Record<string, string> = {
  Academy: "from-acad/60 to-acad/0",
  DSML:    "from-dsml/60 to-dsml/0",
  AIML:    "from-aiml/60 to-aiml/0",
  DevOps:  "from-devops/60 to-devops/0",
};
const DOT: Record<string, string> = {
  Academy: "bg-acad", DSML: "bg-dsml", AIML: "bg-aiml", DevOps: "bg-devops",
};

export default function QuestionCard({
  q, index,
}: {
  q: {
    id: number; program: string; company: string; role: string;
    round: string | null; question: string; related_topic: string | null;
  };
  index: number;
}) {
  const prog = q.program in PROG_COLOR ? q.program : "Academy";
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.02, 0.3) }}
      whileHover={{ y: -3 }}
      className="group relative overflow-hidden rounded-2xl border border-edge bg-panel p-5 shadow-card transition-shadow hover:shadow-cardH"
    >
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${PROG_COLOR[prog]}`} />
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-edge bg-panel2 px-2.5 py-0.5 font-mono">
          <span className={`h-1.5 w-1.5 rounded-full ${DOT[prog]}`} />{q.program}
        </span>
        <span className="rounded-full border border-edge bg-panel2 px-2.5 py-0.5 font-mono text-mute">{q.company.trim()}</span>
        <span className="rounded-full border border-edge bg-panel2 px-2.5 py-0.5 font-mono text-mute">{q.role.trim()}</span>
        {q.round && <span className="rounded-full border border-edge bg-panel2 px-2.5 py-0.5 font-mono text-mute">{q.round}</span>}
      </div>
      <p className="whitespace-pre-wrap text-base leading-relaxed text-text">{q.question}</p>
      {q.related_topic && (
        <div className="mt-4 flex items-center gap-2 border-t border-edge/60 pt-3 text-sm text-mute">
          <span className="font-mono uppercase tracking-widest text-[11px]">Topic</span>
          <span className="text-text/80">{q.related_topic}</span>
        </div>
      )}
    </motion.article>
  );
}

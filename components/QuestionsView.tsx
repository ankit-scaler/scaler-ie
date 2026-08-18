"use client";
import { useMemo, useState, useEffect } from "react";
import Filters, { FilterState } from "./Filters";
import QuestionCard from "./QuestionCard";

type Q = { id: number; program: string; company: string; role: string; round: string | null; question: string; related_topic: string | null };

const PAGE = 30;

export default function QuestionsView({ initial }: { initial: Q[] }) {
  const [state, setState] = useState<FilterState>({ program: "All", company: "All", role: "All", round: "All", q: "" });
  const [visible, setVisible] = useState(PAGE);

  const filtered = useMemo(() => {
    const qLower = state.q.trim().toLowerCase();
    return initial.filter(x =>
      (state.program === "All" || x.program === state.program) &&
      (state.company === "All" || x.company.trim() === state.company.trim()) &&
      (state.role === "All"    || x.role.trim()    === state.role.trim()) &&
      (state.round === "All"   || (x.round || "")  === state.round) &&
      (!qLower || x.question.toLowerCase().includes(qLower) || (x.related_topic || "").toLowerCase().includes(qLower))
    );
  }, [initial, state]);

  // Fire a view event when filter narrows to a specific company+role
  useEffect(() => {
    if (state.company !== "All" && state.role !== "All") {
      fetch("/api/track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company: state.company, role: state.role,
          program: state.program === "All" ? null : state.program,
          path: "/",
        }),
      }).catch(() => {});
    }
  }, [state.company, state.role, state.program]);

  useEffect(() => setVisible(PAGE), [state]);

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-6">
          <span className="font-mono text-[10px] uppercase tracking-widest text-mute">The Vault</span>
          <h1 className="mt-1 font-display text-4xl leading-tight sm:text-5xl">
            {initial.length.toLocaleString()} questions,<br />
            <span className="text-mute">asked in real interviews.</span>
          </h1>
        </div>
        <Filters data={initial} state={state} setState={setState} />
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <span className="font-mono text-xs text-mute">
            {filtered.length.toLocaleString()} match{filtered.length === 1 ? "" : "es"}
          </span>
        </div>
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-edge bg-panel p-10 text-center text-mute">
            Nothing matches these filters yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.slice(0, visible).map((q, i) => <QuestionCard key={q.id} q={q} index={i} />)}
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

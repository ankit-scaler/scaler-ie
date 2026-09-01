"use client";
import { useMemo } from "react";
import { motion } from "framer-motion";

export type FilterState = {
  program: string; company: string; role: string; round: string; topic: string; q: string;
};

// Canonical spelling + display order for known programs; anything else found
// in the data (unexpected casing, a brand-new program) is appended after.
const CANONICAL_PROGRAMS = ["Academy", "DSML", "AIML", "DevOps"];

export default function Filters({
  data, state, setState, showRound = true, showTopic = false,
}: {
  data: { program?: string; company: string; role: string; round?: string | null; related_topic?: string | null }[];
  state: FilterState;
  setState: (s: FilterState) => void;
  showRound?: boolean;
  showTopic?: boolean;
}) {
  // Only show a program pill if this dataset actually has rows for it — e.g.
  // AIML shouldn't appear on Assignments if no assignment has that program.
  const programs = useMemo(() => {
    const present = Array.from(new Set(data.map(d => (d.program || "").trim()).filter(Boolean)));
    const known = CANONICAL_PROGRAMS.filter(c => present.some(p => p.toLowerCase() === c.toLowerCase()));
    const extra = present.filter(p => !CANONICAL_PROGRAMS.some(c => c.toLowerCase() === p.toLowerCase())).sort();
    return ["All", ...known, ...extra];
  }, [data]);

  const filteredForCompany = useMemo(
    () => (state.program === "All" ? data : data.filter(d => (d.program || "").toLowerCase() === state.program.toLowerCase())),
    [data, state.program]
  );
  const companies = useMemo(
    () => ["All", ...Array.from(new Set(filteredForCompany.map(d => d.company).filter(Boolean))).sort()],
    [filteredForCompany]
  );
  const roles = useMemo(() => {
    const scope = state.company === "All"
      ? filteredForCompany
      : filteredForCompany.filter(d => d.company === state.company);
    return ["All", ...Array.from(new Set(scope.map(d => d.role).filter(Boolean))).sort()];
  }, [filteredForCompany, state.company]);
  const rounds = useMemo(() => {
    const scope = filteredForCompany.filter(d =>
      (state.company === "All" || d.company === state.company) &&
      (state.role === "All" || d.role === state.role)
    );
    return ["All", ...Array.from(new Set(scope.map(d => d.round || "").filter(Boolean))).sort()];
  }, [filteredForCompany, state.company, state.role]);
  // Topic is a cross-cutting facet (any company/role can carry any topic),
  // so unlike rounds it's scoped only to the program pill, not company/role.
  const topics = useMemo(
    () => ["All", ...Array.from(new Set(filteredForCompany.map(d => d.related_topic || "").filter(Boolean))).sort()],
    [filteredForCompany]
  );
  const topicCounts = useMemo(() => {
    const m = new Map<string, number>();
    filteredForCompany.forEach(d => {
      const t = d.related_topic || "";
      if (t) m.set(t, (m.get(t) || 0) + 1);
    });
    return m;
  }, [filteredForCompany]);

  const Pill = ({ value, active, onClick }: { value: string; active: boolean; onClick: () => void }) => (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      transition={{ duration: 0.1 }}
      className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors duration-200 ${
        active ? "border-text bg-text text-ink" : "border-edge text-mute hover:border-text/40 hover:text-text"
      }`}
    >{value}</motion.button>
  );

  const Select = ({ label, value, options, onChange, accent, optionLabel }: {
    label: string; value: string; options: string[]; onChange: (v: string) => void; accent: string;
    optionLabel?: (o: string) => string;
  }) => (
    <label className="group flex min-w-0 flex-col gap-1.5">
      <span className={`font-mono text-[11px] font-semibold uppercase tracking-widest ${accent}`}>{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-xl border border-edge bg-panel px-3 py-2.5 pr-9 text-sm text-text transition-colors focus:border-acad focus:outline-none group-hover:border-text/40"
        >
          {options.map(o => <option key={o} value={o} className="bg-panel">{optionLabel ? optionLabel(o) : o}</option>)}
        </select>
        <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute transition-colors duration-200 group-hover:text-text" viewBox="0 0 20 20" fill="currentColor">
          <path d="M5 8l5 5 5-5H5z" />
        </svg>
      </div>
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {programs.map(p => (
          <Pill key={p} value={p} active={state.program === p}
            onClick={() => setState({ ...state, program: p, company: "All", role: "All", round: "All", topic: "All" })} />
        ))}
      </div>
      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${
        showRound && showTopic ? "lg:grid-cols-5" : showRound || showTopic ? "lg:grid-cols-4" : "lg:grid-cols-3"
      }`}>
        <Select label="Company" value={state.company} options={companies} accent="text-acad"
          onChange={v => setState({ ...state, company: v, role: "All", round: "All" })} />
        <Select label="Role" value={state.role} options={roles} accent="text-dsml"
          onChange={v => setState({ ...state, role: v, round: "All" })} />
        {showRound && (
          <Select label="Round" value={state.round} options={rounds} accent="text-aiml"
            onChange={v => setState({ ...state, round: v })} />
        )}
        {showTopic && (
          <Select label="Topic" value={state.topic} options={topics} accent="text-topic"
            onChange={v => setState({ ...state, topic: v })}
            optionLabel={o => o === "All" ? `All (${filteredForCompany.length})` : `${o} (${topicCounts.get(o) || 0})`} />
        )}
        <label className="group flex flex-col gap-1.5">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-devops">Search</span>
          <input
            value={state.q}
            onChange={e => setState({ ...state, q: e.target.value })}
            placeholder="keyword..."
            className="rounded-xl border border-edge bg-panel px-3 py-2.5 text-sm text-text placeholder:text-mute/60 transition-colors focus:border-acad focus:outline-none group-hover:border-text/40"
          />
        </label>
      </div>
    </div>
  );
}

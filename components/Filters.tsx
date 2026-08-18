"use client";
import { useMemo } from "react";

export type FilterState = {
  program: string; company: string; role: string; round: string; q: string;
};

const PROGRAMS = ["All", "Academy", "DSML", "AIML", "DevOps"];

export default function Filters({
  data, state, setState, showRound = true,
}: {
  data: { program?: string; company: string; role: string; round?: string | null }[];
  state: FilterState;
  setState: (s: FilterState) => void;
  showRound?: boolean;
}) {
  const filteredForCompany = useMemo(
    () => (state.program === "All" ? data : data.filter(d => d.program === state.program)),
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

  const Pill = ({ value, active, onClick }: { value: string; active: boolean; onClick: () => void }) => (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition ${
        active ? "border-text bg-text text-ink" : "border-edge text-mute hover:border-text/40 hover:text-text"
      }`}
    >{value}</button>
  );

  const Select = ({ label, value, options, onChange }: {
    label: string; value: string; options: string[]; onChange: (v: string) => void;
  }) => (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="font-mono text-[11px] uppercase tracking-widest text-mute">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-xl border border-edge bg-panel px-3 py-2.5 pr-9 text-sm text-text focus:border-acad focus:outline-none"
        >
          {options.map(o => <option key={o} value={o} className="bg-panel">{o}</option>)}
        </select>
        <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" viewBox="0 0 20 20" fill="currentColor">
          <path d="M5 8l5 5 5-5H5z" />
        </svg>
      </div>
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {PROGRAMS.map(p => (
          <Pill key={p} value={p} active={state.program === p}
            onClick={() => setState({ ...state, program: p, company: "All", role: "All", round: "All" })} />
        ))}
      </div>
      <div className={`grid grid-cols-1 gap-3 ${showRound ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        <Select label="Company" value={state.company} options={companies}
          onChange={v => setState({ ...state, company: v, role: "All", round: "All" })} />
        <Select label="Role" value={state.role} options={roles}
          onChange={v => setState({ ...state, role: v, round: "All" })} />
        {showRound && (
          <Select label="Round" value={state.round} options={rounds}
            onChange={v => setState({ ...state, round: v })} />
        )}
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] uppercase tracking-widest text-mute">Search</span>
          <input
            value={state.q}
            onChange={e => setState({ ...state, q: e.target.value })}
            placeholder="keyword..."
            className="rounded-xl border border-edge bg-panel px-3 py-2.5 text-sm text-text placeholder:text-mute/60 focus:border-acad focus:outline-none"
          />
        </label>
      </div>
    </div>
  );
}

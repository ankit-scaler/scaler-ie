"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

// role and round are multi-select: an empty list means "All".
export type FilterState = {
  program: string; company: string; role: string[]; round: string[]; topic: string; q: string;
};

// Searchable multi-select. Defined at module level (not inside Filters) so its
// open/search state and input focus survive the parent re-rendering.
function MultiSelect({ label, accent, options, value, onChange }: {
  label: string; accent: string; options: string[]; value: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) { setQ(""); return; }
    inputRef.current?.focus();
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? options.filter(o => o.toLowerCase().includes(t)) : options;
  }, [options, q]);
  const selected = useMemo(() => new Set(value), [value]);
  const toggle = (o: string) => onChange(selected.has(o) ? value.filter(v => v !== o) : [...value, o]);
  const selectAllMatching = () => onChange(Array.from(new Set([...value, ...matches])));
  const summary = value.length === 0 ? "All" : value.length === 1 ? value[0] : `${value.length} selected`;

  return (
    <div className="group flex min-w-0 flex-col gap-1.5" ref={ref}>
      <span className={`font-mono text-[11px] font-semibold uppercase tracking-widest ${accent}`}>{label}</span>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex w-full items-center rounded-xl border border-edge bg-panel px-3 py-2.5 pr-9 text-left text-sm text-text transition-colors focus:border-acad focus:outline-none group-hover:border-text/40"
        >
          <span className="truncate">{summary}</span>
        </button>
        <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" viewBox="0 0 20 20" fill="currentColor">
          <path d="M5 8l5 5 5-5H5z" />
        </svg>
        {open && (
          <div className="absolute left-0 top-full z-30 mt-1 w-full min-w-[240px] overflow-hidden rounded-xl border border-edge bg-panel shadow-card">
            <div className="border-b border-edge/60 p-2">
              <input
                ref={inputRef}
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}...`}
                className="w-full rounded-lg border border-edge bg-panel2 px-3 py-2 text-sm text-text placeholder:text-mute/60 focus:border-acad focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-between border-b border-edge/60 px-3 py-2 text-xs">
              <span className="font-mono text-mute">{matches.length} {q.trim() ? "matching" : "options"}</span>
              <span className="flex gap-3">
                <button type="button" onClick={selectAllMatching} disabled={matches.length === 0} className="text-acad hover:underline disabled:opacity-40">
                  Select all{q.trim() ? ` ${matches.length}` : ""}
                </button>
                <button type="button" onClick={() => onChange([])} disabled={value.length === 0} className="text-mute hover:text-text hover:underline disabled:opacity-40">
                  Clear
                </button>
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto py-1" role="listbox" aria-multiselectable="true">
              {matches.length === 0 ? (
                <div className="px-3 py-3 text-sm text-mute">No matches.</div>
              ) : matches.map(o => (
                <label key={o} className="flex cursor-pointer items-start gap-2.5 px-3 py-1.5 text-sm text-text hover:bg-panel2">
                  <input type="checkbox" checked={selected.has(o)} onChange={() => toggle(o)} className="mt-0.5 h-4 w-4 shrink-0 accent-acad" />
                  <span className="break-words">{o}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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
    return Array.from(new Set(scope.map(d => d.role).filter(Boolean))).sort();
  }, [filteredForCompany, state.company]);
  // Rounds available for a given role selection (empty = any role).
  const roundsFor = (roleSel: string[]) => {
    const scope = filteredForCompany.filter(d =>
      (state.company === "All" || d.company === state.company) &&
      (roleSel.length === 0 || roleSel.includes(d.role))
    );
    return Array.from(new Set(scope.map(d => d.round || "").filter(Boolean))).sort();
  };
  const rounds = useMemo(
    () => roundsFor(state.role),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredForCompany, state.company, state.role]
  );
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
            onClick={() => setState({ ...state, program: p, company: "All", role: [], round: [], topic: "All" })} />
        ))}
      </div>
      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${
        showRound && showTopic ? "lg:grid-cols-5" : showRound || showTopic ? "lg:grid-cols-4" : "lg:grid-cols-3"
      }`}>
        <Select label="Company" value={state.company} options={companies} accent="text-acad"
          onChange={v => setState({ ...state, company: v, role: [], round: [] })} />
        <MultiSelect label="Role" value={state.role} options={roles} accent="text-dsml"
          onChange={v => {
            // Keep only rounds that still exist under the new role selection.
            const avail = new Set(roundsFor(v));
            setState({ ...state, role: v, round: state.round.filter(r => avail.has(r)) });
          }} />
        {showRound && (
          <MultiSelect label="Round" value={state.round} options={rounds} accent="text-aiml"
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

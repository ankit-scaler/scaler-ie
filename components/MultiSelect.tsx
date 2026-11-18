"use client";
import { useEffect, useMemo, useRef, useState } from "react";

// Searchable multi-select: type to narrow the list, "Select all N" adds every
// match, "Clear" empties it. An empty selection means "All".
// Used by the Questions / Assignments filters (labelled) and the Packets page
// (`inline`: no label above, styled like the plain selects beside it).
// Keep this at module level so open/search state and input focus survive the
// parent re-rendering.
export default function MultiSelect({ label, accent = "text-mute", options, value, onChange, inline = false, allLabel = "All" }: {
  label: string; accent?: string; options: string[]; value: string[]; onChange: (v: string[]) => void;
  inline?: boolean;     // no label above; same box styling as a neighbouring native <select>
  allLabel?: string;    // what the button says when nothing is selected
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
  const summary = value.length === 0 ? allLabel : value.length === 1 ? value[0] : `${value.length} selected`;

  return (
    <div className={inline ? "group min-w-[170px]" : "group flex min-w-0 flex-col gap-1.5"} ref={ref}>
      {!inline && (
        <span className={`font-mono text-[11px] font-semibold uppercase tracking-widest ${accent}`}>{label}</span>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={inline ? label : undefined}
          className={`flex w-full items-center rounded-xl border border-edge bg-panel px-3 pr-9 text-left text-sm text-text transition-colors focus:border-acad focus:outline-none group-hover:border-text/40 ${inline ? "py-2" : "py-2.5"}`}
        >
          <span className="truncate">{summary}</span>
        </button>
        <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" viewBox="0 0 20 20" fill="currentColor">
          <path d="M5 8l5 5 5-5H5z" />
        </svg>
        {open && (
          <div className="absolute left-0 top-full z-30 mt-1 w-full min-w-[260px] overflow-hidden rounded-xl border border-edge bg-panel shadow-card">
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

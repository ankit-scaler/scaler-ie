"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Combobox, { ComboOption } from "./Combobox";

export type Facet = {
  key: string;
  label: string;
  value: string;
  options: ComboOption[];
  onChange: (v: string) => void;
  searchable?: boolean;
};

// A suggestion under the search box ("Companies", "Roles", "Topics"):
// picking one sets that facet instead of searching the text.
export type Suggestion = { group: string; value: string; count?: number; onPick: () => void };

// The one filter layout every list page shares: a search box first (most
// learners arrive looking for one company), then the segments (programme /
// track) and the facet buttons. On phones the facets fold behind a single
// "Filters" button so the list isn't pushed below the fold.
export default function FilterBar({
  search, onSearch, placeholder, suggestions = [],
  segments, facets = [], extra, onClearAll,
}: {
  search: string;
  onSearch: (v: string) => void;
  placeholder: string;
  suggestions?: Suggestion[];
  segments?: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void };
  facets?: Facet[];
  extra?: React.ReactNode;
  onClearAll?: () => void;
}) {
  const [showFacets, setShowFacets] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const activeFacets = facets.filter(f => f.value !== "All").length;
  const anyActive = activeFacets > 0 || search.trim() !== "" || (segments && segments.value !== "All");

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const byGroup = new Map<string, Suggestion[]>();
    for (const s of suggestions) {
      if (!s.value.toLowerCase().includes(q)) continue;
      const list = byGroup.get(s.group) || [];
      if (list.length < 5) list.push(s);
      byGroup.set(s.group, list);
    }
    return Array.from(byGroup.values()).flat();
  }, [search, suggestions]);

  useEffect(() => {
    if (!suggestOpen) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setSuggestOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [suggestOpen]);

  const pick = (s: Suggestion) => { s.onPick(); setSuggestOpen(false); setHi(-1); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!shown.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setSuggestOpen(true); setHi(i => Math.min(i + 1, shown.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi(i => Math.max(i - 1, -1)); }
    else if (e.key === "Enter" && hi >= 0) { e.preventDefault(); pick(shown[hi]); }
    else if (e.key === "Escape") setSuggestOpen(false);
  };

  return (
    <div className="space-y-3">
      <div ref={boxRef} className="relative">
        <svg className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <circle cx="9" cy="9" r="5.5" /><path d="M13.2 13.2L17 17" />
        </svg>
        <input
          value={search}
          onChange={e => { onSearch(e.target.value); setSuggestOpen(true); setHi(-1); }}
          onFocus={() => setSuggestOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={placeholder}
          role="combobox"
          aria-expanded={suggestOpen && shown.length > 0}
          aria-autocomplete="list"
          className="w-full rounded-2xl border border-edge bg-panel py-3 pl-11 pr-10 text-base text-text placeholder:text-mute transition-colors focus:border-acad/60 focus:outline-none"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearch("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-mute transition-colors hover:bg-panel2 hover:text-text"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M5 5l10 10M15 5L5 15" /></svg>
          </button>
        )}
        {suggestOpen && shown.length > 0 && (
          <ul role="listbox" aria-label="Suggestions" className="absolute inset-x-0 top-full z-30 mt-2 max-h-80 overflow-y-auto rounded-xl border border-edge bg-panel py-1 shadow-cardH">
            {shown.map((s, i) => (
              <li key={`${s.group}:${s.value}`}>
                {(i === 0 || shown[i - 1].group !== s.group) && (
                  <div className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-widest text-mute">{s.group}</div>
                )}
                <div
                  role="option"
                  aria-selected={i === hi}
                  onMouseEnter={() => setHi(i)}
                  onMouseDown={e => { e.preventDefault(); pick(s); }}
                  className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${i === hi ? "bg-panel2" : ""}`}
                >
                  <span className="truncate text-text">{s.value}</span>
                  {s.count !== undefined && <span className="shrink-0 font-mono text-xs text-mute">{s.count.toLocaleString()}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {segments && (
          <div role="group" aria-label="Programme" className="flex max-w-full overflow-x-auto rounded-full border border-edge bg-panel p-1">
            {segments.options.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => segments.onChange(o.value)}
                aria-pressed={segments.value === o.value}
                className={`whitespace-nowrap rounded-full px-3 py-1 text-sm transition-colors duration-200 ${
                  segments.value === o.value ? "bg-text text-ink" : "text-mute hover:text-text"
                }`}
              >{o.label}</button>
            ))}
          </div>
        )}
        {facets.length > 0 && (
          <button
            type="button"
            onClick={() => setShowFacets(v => !v)}
            aria-expanded={showFacets}
            className="rounded-full border border-edge bg-panel px-3.5 py-1.5 text-sm text-mute transition-colors hover:text-text sm:hidden"
          >Filters{activeFacets ? ` (${activeFacets})` : ""}</button>
        )}
        <div className={`${showFacets ? "flex" : "hidden"} w-full flex-wrap items-center gap-2 sm:flex sm:w-auto`}>
          {facets.map(f => (
            <Combobox key={f.key} label={f.label} value={f.value} options={f.options} onChange={f.onChange} searchable={f.searchable} />
          ))}
          {extra}
        </div>
        {anyActive && onClearAll && (
          <button type="button" onClick={onClearAll} className="ml-auto text-sm text-mute underline-offset-4 transition-colors hover:text-text hover:underline">
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}

// The empty-list message every list page shows, with a way out when it's
// the filters (not the data) that emptied it.
export function EmptyState({ onClear, children }: { onClear?: () => void; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-edge bg-panel p-10 text-center text-mute">
      <p>{children || "Nothing matches these filters yet."}</p>
      {onClear && (
        <button type="button" onClick={onClear} className="mt-4 rounded-full border border-edge px-4 py-2 text-sm text-text transition-colors hover:border-text/40">
          Clear filters
        </button>
      )}
    </div>
  );
}

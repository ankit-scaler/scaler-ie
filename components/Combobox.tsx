"use client";
import { useEffect, useMemo, useRef, useState } from "react";

export type ComboOption = { value: string; label?: string; count?: number };

// A filter button that opens a searchable list — replaces the native
// <select>s, which were unusable with hundreds of companies (no typing to
// narrow on most phones) and couldn't be styled to match the rest of the
// app. "All" is the "no filter" value: the button then shows just the
// label; once set it shows "Label: value" with an ✕ to clear.
export default function Combobox({
  label, value, options, onChange, allValue = "All", searchable = true,
}: {
  label: string;
  value: string;
  options: ComboOption[];
  onChange: (v: string) => void;
  allValue?: string;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const active = value !== allValue;
  const current = options.find(o => o.value === value);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = options.filter(o => o.value !== allValue);
    return q ? list.filter(o => (o.label || o.value).toLowerCase().includes(q)) : list;
  }, [options, query, allValue]);

  useEffect(() => {
    if (!open) return;
    setQuery(""); setHi(0);
    requestAnimationFrame(() => (searchable ? inputRef.current : listRef.current)?.focus());
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, searchable]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" });
  }, [hi]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi(i => Math.min(i + 1, shown.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (shown[hi]) pick(shown[hi].value); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); buttonRef.current?.focus(); }
  };

  return (
    <div ref={rootRef} className="relative">
      <div
        className={`flex items-center rounded-full border text-sm transition-colors duration-200 ${
          active ? "border-acad/50 bg-acad/10 text-text" : "border-edge bg-panel text-mute hover:border-text/40 hover:text-text"
        }`}
      >
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={active ? `${label}: ${current?.label || value}. Change ${label.toLowerCase()}` : `Filter by ${label.toLowerCase()}`}
          className={`flex max-w-[16rem] items-center gap-1.5 py-1.5 pl-3.5 ${active ? "pr-1" : "pr-3"}`}
        >
          <span className="truncate">
            {active ? <><span className="text-mute">{label}:</span> {current?.label || value}</> : label}
          </span>
          {!active && (
            <svg className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M5.5 7.5l4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
        {active && (
          <button
            type="button"
            onClick={() => onChange(allValue)}
            aria-label={`Clear ${label.toLowerCase()} filter`}
            className="mr-1 rounded-full p-1 text-mute transition-colors hover:bg-panel2 hover:text-text"
          >
            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M5 5l10 10M15 5L5 15" /></svg>
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-edge bg-panel shadow-cardH">
          {searchable && (
            <div className="border-b border-edge/60 p-2">
              <input
                ref={inputRef}
                value={query}
                onChange={e => { setQuery(e.target.value); setHi(0); }}
                onKeyDown={onKeyDown}
                placeholder={`Search ${label.toLowerCase()}…`}
                aria-label={`Search ${label.toLowerCase()}`}
                className="w-full rounded-lg bg-panel2 px-3 py-2 text-sm text-text placeholder:text-mute focus:outline-none"
              />
            </div>
          )}
          <ul
            ref={listRef}
            role="listbox"
            aria-label={label}
            tabIndex={searchable ? -1 : 0}
            onKeyDown={searchable ? undefined : onKeyDown}
            className="max-h-72 overflow-y-auto py-1 focus:outline-none"
          >
            {shown.length === 0 ? (
              <li className="px-3 py-2.5 text-sm text-mute">No matches</li>
            ) : shown.map((o, i) => (
              <li
                key={o.value}
                data-i={i}
                role="option"
                aria-selected={o.value === value}
                onMouseEnter={() => setHi(i)}
                onClick={() => pick(o.value)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${
                  i === hi ? "bg-panel2 text-text" : "text-text/90"
                }`}
              >
                <span className="truncate">{o.label || o.value}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {o.count !== undefined && <span className="font-mono text-xs text-mute">{o.count.toLocaleString()}</span>}
                  {o.value === value && (
                    <svg className="h-3.5 w-3.5 text-acad" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// The multi-select version (Role and Round on Questions/Assignments): same
// pill button as Combobox, opening a searchable checkbox list with "Select
// all" (everything matching the search) and "Clear". An empty list means
// no filter. The button shows "Label: value" for one pick and
// "Label: N selected" for more, with an ✕ to clear.
export function MultiCombobox({
  label, values, options, onChange,
}: {
  label: string;
  values: string[];
  options: ComboOption[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const active = values.length > 0;
  const selected = useMemo(() => new Set(values), [values]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter(o => (o.label || o.value).toLowerCase().includes(q)) : options;
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    requestAnimationFrame(() => inputRef.current?.focus());
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); buttonRef.current?.focus(); }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const toggle = (v: string) => onChange(selected.has(v) ? values.filter(x => x !== v) : [...values, v]);
  const selectAllShown = () => onChange(Array.from(new Set([...values, ...shown.map(o => o.value)])));
  const summary = values.length === 1 ? (options.find(o => o.value === values[0])?.label || values[0]) : `${values.length} selected`;

  return (
    <div ref={rootRef} className="relative">
      <div
        className={`flex items-center rounded-full border text-sm transition-colors duration-200 ${
          active ? "border-acad/50 bg-acad/10 text-text" : "border-edge bg-panel text-mute hover:border-text/40 hover:text-text"
        }`}
      >
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={active ? `${label}: ${summary}. Change ${label.toLowerCase()}` : `Filter by ${label.toLowerCase()}`}
          className={`flex max-w-[16rem] items-center gap-1.5 py-1.5 pl-3.5 ${active ? "pr-1" : "pr-3"}`}
        >
          <span className="truncate">
            {active ? <><span className="text-mute">{label}:</span> {summary}</> : label}
          </span>
          {!active && (
            <svg className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M5.5 7.5l4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
        {active && (
          <button
            type="button"
            onClick={() => onChange([])}
            aria-label={`Clear ${label.toLowerCase()} filter`}
            className="mr-1 rounded-full p-1 text-mute transition-colors hover:bg-panel2 hover:text-text"
          >
            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M5 5l10 10M15 5L5 15" /></svg>
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-edge bg-panel shadow-cardH">
          <div className="border-b border-edge/60 p-2">
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
              aria-label={`Search ${label.toLowerCase()}`}
              className="w-full rounded-lg bg-panel2 px-3 py-2 text-sm text-text placeholder:text-mute focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-between border-b border-edge/60 px-3 py-2 text-xs">
            <span className="font-mono text-mute">{shown.length} {query.trim() ? "matching" : "options"}</span>
            <span className="flex gap-3">
              <button type="button" onClick={selectAllShown} disabled={shown.length === 0} className="text-acad hover:underline disabled:opacity-40">
                Select all{query.trim() ? ` ${shown.length}` : ""}
              </button>
              <button type="button" onClick={() => onChange([])} disabled={!active} className="text-mute hover:text-text hover:underline disabled:opacity-40">
                Clear
              </button>
            </span>
          </div>
          <div role="listbox" aria-label={label} aria-multiselectable="true" className="max-h-72 overflow-y-auto py-1">
            {shown.length === 0 ? (
              <div className="px-3 py-2.5 text-sm text-mute">No matches</div>
            ) : shown.map(o => (
              <label key={o.value} className="flex cursor-pointer items-start gap-2.5 px-3 py-2 text-sm text-text/90 hover:bg-panel2 hover:text-text">
                <input type="checkbox" checked={selected.has(o.value)} onChange={() => toggle(o.value)} className="mt-0.5 h-4 w-4 shrink-0 accent-acad" />
                <span className="min-w-0 flex-1 break-words">{o.label || o.value}</span>
                {o.count !== undefined && <span className="shrink-0 font-mono text-xs text-mute">{o.count.toLocaleString()}</span>}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

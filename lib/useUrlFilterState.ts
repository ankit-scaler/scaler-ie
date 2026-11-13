"use client";
import { useEffect, useRef, useState } from "react";
import type { FilterState } from "@/components/Filters";

const STR_KEYS = ["program", "company", "topic", "q"] as const;
// Multi-select filters: written as repeated params (?role=A&role=B), so values
// containing commas are safe. A legacy single ?role=A still reads as ["A"].
const LIST_KEYS = ["role", "round"] as const;

// Keeps a Filters' FilterState mirrored into the URL query string (?company=
// ...&role=...) so the exact filtered view — or a specific packet's page,
// via the [id] segment itself — can be copied out of the address bar and
// shared. A learner opening that link straight from a signed-out browser
// gets bounced through /login?next=<this same path+query> (middleware) and
// lands back on it after signing in (see app/auth/callback), so the shared
// view survives the auth round-trip.
//
// Reading/writing goes through plain browser APIs (not next/navigation's
// useSearchParams/router.replace) on purpose: this project's filtering is
// already all client-side, so there's nothing server-side to re-fetch on a
// query-string change, and avoiding the Next router here means no extra
// network round-trip per keystroke in the search box.
export function useUrlFilterState(defaults: FilterState) {
  const [state, setState] = useState<FilterState>(defaults);
  const readFromUrl = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next: FilterState = { ...defaults };
    let changed = false;
    for (const k of STR_KEYS) {
      const v = params.get(k);
      if (v) { next[k] = v; changed = true; }
    }
    for (const k of LIST_KEYS) {
      const vs = params.getAll(k).filter(v => v && v !== "All");
      if (vs.length) { next[k] = vs; changed = true; }
    }
    readFromUrl.current = true;
    if (changed) setState(next);
    // Only ever read the URL once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!readFromUrl.current) return;
    const params = new URLSearchParams();
    for (const k of STR_KEYS) {
      const v = state[k];
      if (v && v !== "All") params.set(k, v);
    }
    for (const k of LIST_KEYS) state[k].forEach(v => params.append(k, v));
    const qs = params.toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [state]);

  return [state, setState] as const;
}

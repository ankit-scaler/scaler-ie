"use client";
import { useEffect, useRef, useState } from "react";

type Value = string | number | boolean | null;

// useUrlFilterState, generalized to any flat filter shape. Mirrors every
// field that differs from its default into the query string (?company=…&
// remote=1) so a filtered view can be copied out of the address bar or
// linked to from elsewhere (CO Dashboard, the packet pages' "Also for …"
// links), and survives the /login?next=… round-trip. Query params this
// hook doesn't own (e.g. ?ref= on a cross-link) are left alone.
//
// Same reasons as useUrlFilterState for using plain browser APIs instead
// of next/navigation: filtering here is entirely client-side, so a router
// round-trip per keystroke would buy nothing.
export function useUrlState<T extends Record<string, Value>>(defaults: T) {
  const [state, setState] = useState<T>(defaults);
  const readFromUrl = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = { ...defaults };
    let changed = false;
    for (const key of Object.keys(defaults) as (keyof T & string)[]) {
      const raw = params.get(key);
      if (raw === null) continue;
      const d = defaults[key];
      const parsed: Value =
        typeof d === "boolean" ? raw === "1" :
        typeof d === "number" || (d === null && /^\d+$/.test(raw)) ? Number(raw) :
        raw;
      (next as Record<string, Value>)[key] = parsed;
      changed = true;
    }
    readFromUrl.current = true;
    if (changed) setState(next);
    // Only ever read the URL once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!readFromUrl.current) return;
    const params = new URLSearchParams(window.location.search);
    for (const key of Object.keys(defaults)) {
      const v = state[key];
      if (v === defaults[key] || v === null || v === "" || v === false) params.delete(key);
      else params.set(key, v === true ? "1" : String(v));
    }
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return [state, setState] as const;
}

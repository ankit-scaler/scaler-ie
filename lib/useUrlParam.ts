"use client";
import { useEffect, useRef, useState } from "react";

// Same idea as useUrlFilterState, generalized to a single string param —
// for pages with just one filter dimension (e.g. the Packets role pills)
// rather than the full Company/Role/Round/Topic shape. Mirrors `value` into
// the URL (?key=value) so the current selection can be copied out of the
// address bar and shared, and survives the /login?next=... round-trip the
// same way. Reads via plain browser APIs (not next/navigation) so there's
// no extra server round-trip for what's already client-side-only filtering,
// and preserves any other query params already on the page.
export function useUrlParam(key: string, defaultValue: string) {
  const [value, setValue] = useState(defaultValue);
  const readFromUrl = useRef(false);

  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get(key);
    readFromUrl.current = true;
    if (v) setValue(v);
    // Only ever read the URL once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!readFromUrl.current) return;
    const params = new URLSearchParams(window.location.search);
    if (value && value !== defaultValue) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return [value, setValue] as const;
}

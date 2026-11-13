"use client";
import type { FilterState } from "@/components/Filters";
import { useUrlState } from "./useUrlState";

// Keeps a Filters' FilterState mirrored into the URL (?company=...&role=...)
// so the exact filtered view can be copied out of the address bar and
// shared, and survives the /login?next=... round-trip (see middleware and
// app/auth/callback). Now a thin wrapper over the general useUrlState,
// which also leaves query params it doesn't own (like ?ref=) in place.
export function useUrlFilterState(defaults: FilterState) {
  return useUrlState<FilterState>(defaults);
}

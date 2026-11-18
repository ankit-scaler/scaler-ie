"use client";
import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { createVisitPinger } from "@/lib/visit-ping";

// Records one "visit" (a `sessions` row) per browser per 5 minutes.
//
// The row is inserted straight from the browser into Supabase under the
// learner's own login (RLS policy "own sessions rw" only allows their own
// email), so it needs NO Vercel function and costs no Fluid Active CPU. If the
// direct insert ever fails, it falls back once to the old /api/heartbeat route
// so visit tracking never silently stops. The 5-minute gate is remembered in
// localStorage, so reloads and extra tabs don't add extra visits. No timer, no
// time-on-site tracking, and hidden tabs record nothing. See lib/visit-ping.ts.
export default function Heartbeat() {
  useEffect(() => {
    const sb = supabaseBrowser();
    let stop = false;
    const ping = createVisitPinger({
      now: () => Date.now(),
      visible: () => !stop && document.visibilityState === "visible",
      storage: (() => { try { return window.localStorage; } catch { return null; } })(),
      getEmail: async () => (await sb.auth.getSession()).data.session?.user?.email ?? null,
      insertSession: async (email) => {
        const { error } = await sb.from("sessions").insert({ user_email: email });
        return { error };
      },
      fallback: async () => (await fetch("/api/heartbeat", { method: "POST" })).ok,
    });
    const run = () => { ping().catch(() => {}); };
    run();
    document.addEventListener("visibilitychange", run);
    return () => { stop = true; document.removeEventListener("visibilitychange", run); };
  }, []);
  return null;
}

"use client";
import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

// A "visit ping", not a heartbeat: every call is a Vercel function
// invocation (/api/heartbeat) that counts toward Fluid Active CPU, so there
// is NO repeating timer and no time-on-site tracking. One ping when a tab is
// visible, and another only when the tab becomes visible again after more
// than the server's 5-minute session window (so a return after a break
// counts as a new visit). Hidden/background tabs send nothing.
const SESSION_WINDOW_MS = 5 * 60_000;

export default function Heartbeat() {
  useEffect(() => {
    const sb = supabaseBrowser();
    let stop = false;
    let last = 0;
    const ping = async () => {
      if (stop || document.visibilityState !== "visible") return;
      const now = Date.now();
      if (last && now - last < SESSION_WINDOW_MS) return;
      last = now;
      const { data } = await sb.auth.getUser();
      if (!data.user?.email) { last = 0; return; }
      fetch("/api/heartbeat", { method: "POST" }).catch(() => {});
    };
    ping();
    document.addEventListener("visibilitychange", ping);
    return () => { stop = true; document.removeEventListener("visibilitychange", ping); };
  }, []);
  return null;
}

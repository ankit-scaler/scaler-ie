"use client";
import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function Heartbeat() {
  useEffect(() => {
    const sb = supabaseBrowser();
    let stop = false;
    const beat = async () => {
      const { data } = await sb.auth.getUser();
      if (!data.user?.email) return;
      fetch("/api/heartbeat", { method: "POST" }).catch(() => {});
    };
    beat();
    const iv = setInterval(() => { if (!stop) beat(); }, 30_000);
    const vis = () => { if (document.visibilityState === "visible") beat(); };
    document.addEventListener("visibilitychange", vis);
    return () => { stop = true; clearInterval(iv); document.removeEventListener("visibilitychange", vis); };
  }, []);
  return null;
}

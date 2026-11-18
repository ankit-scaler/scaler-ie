"use client";
import { supabaseBrowser } from "@/lib/supabase-browser";

// Records a plain page visit (a `page_views` row with just a path) straight
// from the browser under the learner's own login (RLS "insert own view"), so
// it needs no Vercel function. Falls back to /api/track if the direct insert
// fails. Fire and forget: never blocks or breaks the page.
export async function recordPageView(path: string) {
  try {
    const sb = supabaseBrowser();
    const { data: { session } } = await sb.auth.getSession();
    const email = session?.user?.email;
    if (!email) return;
    const { error } = await sb.from("page_views").insert({ user_email: email, path });
    if (!error) return;
  } catch {
    /* fall through to the server route */
  }
  fetch("/api/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path }),
  }).catch(() => {});
}

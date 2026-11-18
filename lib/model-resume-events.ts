"use client";
import { supabaseBrowser } from "@/lib/supabase-browser";

export type ResumeEventKind =
  | "list_view" | "filter" | "resume_view" | "note_open" | "see_example"
  | "pdf_download" | "mentor_cta" | "mentor_dashboard_cta" | "loom_play";

// Fire and forget: goes straight from the browser to Supabase under the
// learner's own session (RLS only allows their own email), so it costs no
// Vercel function call and a failed insert never blocks or breaks the UI.
export async function trackResumeEvent(
  kind: ResumeEventKind,
  opts: { slug?: string; detail?: Record<string, unknown> } = {}
) {
  try {
    const sb = supabaseBrowser();
    const { data: { session } } = await sb.auth.getSession();
    const email = session?.user?.email;
    if (!email) return;
    await sb.from("model_resume_event").insert({
      kind, slug: opts.slug ?? null, detail: opts.detail ?? null, user_email: email,
    });
  } catch {
    /* tracking must never surface an error */
  }
}

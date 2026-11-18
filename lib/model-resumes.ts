import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-server";
import { CARD_COLUMNS, FULL_COLUMNS, type ResumeCard, type ResumeFull } from "./model-resumes-types";

// Same pattern as app/company-packets/page.tsx: the page checks the learner's
// session first, then reads through this cache. Content is identical for every
// learner and changes only when the content team re-runs the loader, so one
// DB read per hour keeps Vercel CPU and Supabase egress low. After loading new
// content, wait up to an hour (or redeploy) for the cache to refresh.
const REVALIDATE_SECONDS = 3600;

export const getResumeCards = unstable_cache(
  async (): Promise<ResumeCard[]> => {
    const { data, error } = await supabaseAdmin()
      .from("model_resume")
      .select(CARD_COLUMNS)
      .eq("published", true)
      .order("sort_key", { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []) as ResumeCard[];
  },
  ["model-resume-cards"],
  { revalidate: REVALIDATE_SECONDS, tags: ["model-resumes"] }
);

// One resume, cached per slug. Slug is validated by the caller (letters,
// digits, "_" and "-" only) so the cache key space stays bounded.
export const getResume = (slug: string) =>
  unstable_cache(
    async (): Promise<ResumeFull | null> => {
      const { data, error } = await supabaseAdmin()
        .from("model_resume")
        .select(FULL_COLUMNS)
        .eq("slug", slug)
        .eq("published", true)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as ResumeFull | null) ?? null;
    },
    ["model-resume", slug],
    { revalidate: REVALIDATE_SECONDS, tags: ["model-resumes"] }
  )();

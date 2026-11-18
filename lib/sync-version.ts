import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-server";

// When did the nightly sync last finish updating the questions? Written by
// sync/sync_sheet.py into `sync_meta` (supabase/add_sync_meta.sql). The Questions
// page puts this in its cache key (see questionsCacheKey), so a new sync time
// means a fresh copy right after the sync instead of after the 6 h timer.
//
// This lookup is itself cached for 60 s: however many learners are online it is
// at most ~1 tiny primary-key query a minute. If the table or row is missing,
// or the read fails, it returns "none" and the page simply behaves as it did
// before this existed (6 h timer).
export const getQuestionsVersion = unstable_cache(
  async (): Promise<string> => {
    try {
      const { data, error } = await supabaseAdmin()
        .from("sync_meta").select("value").eq("key", "questions_synced_at").maybeSingle();
      if (error || !data?.value) return "none";
      return String(data.value);
    } catch {
      return "none";
    }
  },
  ["questions-version"],
  { revalidate: 60, tags: ["questions"] }
);

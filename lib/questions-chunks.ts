import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-server";
import type { Q } from "@/components/QuestionsView";

// The question list, served to the browser as a few versioned chunk files
// instead of being built into the Questions page on every visit.
//
// Why: the page used to render all ~13k questions (~5 MB) into its HTML on
// every request — ~100 ms of server CPU each time, measured locally — and
// Next's data cache silently refuses entries over 2 MB, so the Supabase
// fetch behind it was never cached either. Now the page only ships a small
// manifest (version + chunk count); the browser fetches each chunk once per
// version from /api/questions/[chunk] and keeps it (Cache-Control: private,
// immutable), so a returning learner costs the server almost nothing.
//
// The version is the "questions" stamp in cache_versions, which the nightly
// sync moves when it finishes (supabase/add_cache_versions.sql). Without
// that table it falls back to an hourly version.

export const ROWS_PER_CHUNK = 2500;  // ~0.85 MB of question rows; well under Next's 2 MB cache entry limit
const REQUEST_ROWS = 1000;           // Supabase's per-request row cap
const COLS = "id,program,company,role,round,question,related_topic,topic_ai";

const getStamp = unstable_cache(
  async (): Promise<string | null> => {
    const { data, error } = await supabaseAdmin()
      .from("cache_versions").select("updated_at").eq("name", "questions").maybeSingle();
    return error || !data ? null : (data.updated_at as string);
  },
  ["questions-stamp"],
  { revalidate: 60, tags: ["questions"] }
);

export type QuestionsManifest = { version: string; chunks: number; total: number };

export async function getQuestionsManifest(): Promise<QuestionsManifest> {
  const stamp = await getStamp();
  const version = stamp ? new Date(stamp).getTime().toString(36) : `h${Math.floor(Date.now() / 3_600_000)}`;
  const total = await unstable_cache(async () => {
    const { count, error } = await supabaseAdmin().from("questions").select("id", { count: "exact", head: true });
    if (error) throw new Error(`questions count failed: ${error.message}`);
    return count ?? 0;
  }, ["questions-count", version], { revalidate: stamp ? 86_400 : 3_600, tags: ["questions"] })();
  return { version, chunks: Math.ceil(total / ROWS_PER_CHUNK), total };
}

// Rows for one chunk of one version. A failed read throws, so it is never
// cached as an empty chunk.
export async function getQuestionsChunk(chunk: number, version: string): Promise<Q[]> {
  return unstable_cache(async () => {
    const from = chunk * ROWS_PER_CHUNK;
    const to = from + ROWS_PER_CHUNK - 1;
    const sb = supabaseAdmin();
    const requests = [];
    for (let start = from; start <= to; start += REQUEST_ROWS) {
      requests.push(sb.from("questions").select(COLS).order("id", { ascending: false })
        .range(start, Math.min(start + REQUEST_ROWS - 1, to)));
    }
    const results = await Promise.all(requests);
    const failed = results.find(r => r.error);
    if (failed?.error) throw new Error(`questions chunk ${chunk} failed: ${failed.error.message}`);
    return results.flatMap(r => (r.data as unknown as Q[]) || []);
  }, ["questions-chunk", version, String(chunk)], { revalidate: 86_400, tags: ["questions"] })();
}

// For Admin edits that change what learners see (topic fixes, topic renames
// and deletes): move the version so browsers fetch fresh chunks right away
// instead of keeping the old ones until the next sync.
export async function bumpQuestionsVersion() {
  const { revalidateTag } = await import("next/cache");
  try {
    await supabaseAdmin().from("cache_versions")
      .upsert({ name: "questions", updated_at: new Date().toISOString() }, { onConflict: "name" });
  } catch (e) {
    console.error("cache_versions bump skipped:", e);
  }
  revalidateTag("questions");
}

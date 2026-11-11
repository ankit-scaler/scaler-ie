import { unstable_cache, revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-server";
import type { Q } from "@/components/QuestionsView";

// The question list, served to the browser as a few versioned chunk files
// instead of being built into the Questions page on every visit.
//
// Why: the page used to render all ~13k questions (~5 MB) into its HTML on
// every request — ~100 ms of server CPU each time, measured locally — and
// Next's data cache silently refuses entries over 2 MB, so the Supabase
// fetch behind it was never cached either. Now the page only ships a small
// manifest (version + chunk count); the browser fetches each chunk from
// /api/questions/[chunk]?v=<version> and keeps it for up to a day.
//
// The version is built from the data itself (row count + newest id) plus
// the "questions" stamp in cache_versions, which the nightly sync moves
// after the questions step and Admin topic edits move straight away. So
// inserted or deleted rows always change the version, even if the sync
// crashes before stamping or the table hasn't been created yet; in-place
// edits that don't move the stamp are bounded by the one-day browser cache.
//
// Chunks are fixed id ranges per version (boundaries worked out once per
// version), not row offsets, so rows inserted or deleted while a chunk is
// being read can't shift other rows out of it.

export const ROWS_PER_CHUNK = 2500;  // ~0.85 MB of question rows; well under Next's 2 MB cache entry limit
export const BROWSER_MAX_AGE = 86_400;  // seconds a browser may reuse a chunk
const REQUEST_ROWS = 1000;           // Supabase's per-request row cap
const COLS = "id,program,company,role,round,question,related_topic,topic_ai";

type VersionInfo = { version: string; total: number };

// Cheap: three tiny queries, at most once a minute per server instance.
const getVersionInfo = unstable_cache(
  async (): Promise<VersionInfo> => {
    const sb = supabaseAdmin();
    const [stampRes, countRes, newestRes] = await Promise.all([
      sb.from("cache_versions").select("updated_at").eq("name", "questions").maybeSingle(),
      sb.from("questions").select("id", { count: "exact", head: true }),
      sb.from("questions").select("id").order("id", { ascending: false }).limit(1),
    ]);
    if (countRes.error) throw new Error(`questions count failed: ${countRes.error.message}`);
    if (newestRes.error) throw new Error(`questions newest id failed: ${newestRes.error.message}`);
    // cache_versions missing (migration not run) just means no stamp part.
    const stamp = !stampRes.error && stampRes.data ? new Date(stampRes.data.updated_at as string).getTime().toString(36) : "n";
    const total = countRes.count ?? 0;
    const newest = (newestRes.data?.[0]?.id as number | undefined) ?? 0;
    return { version: `${stamp}.${total.toString(36)}.${newest.toString(36)}`, total };
  },
  ["questions-version"],
  { revalidate: 60, tags: ["questions"] }
);

export type QuestionsManifest = { version: string; chunks: number; total: number };
type Bounds = { version: string; chunks: number; total: number; edges: number[] };

// edges[k-1] is the highest id in chunk k (k >= 1), in newest-first order:
// chunk 0 = ids above edges[0], chunk k = (edges[k], edges[k-1]], and the
// last chunk = everything at or below its edge. Every id falls in exactly
// one chunk, whatever changes later.
async function getBounds(): Promise<Bounds> {
  const { version, total } = await getVersionInfo();
  const chunks = Math.max(1, Math.ceil(total / ROWS_PER_CHUNK));
  const edges = await unstable_cache(async () => {
    const sb = supabaseAdmin();
    const res = await Promise.all(Array.from({ length: chunks - 1 }, (_, i) => {
      const at = (i + 1) * ROWS_PER_CHUNK;
      return sb.from("questions").select("id").order("id", { ascending: false }).range(at, at);
    }));
    const failed = res.find(r => r.error);
    if (failed?.error) throw new Error(`questions chunk edges failed: ${failed.error.message}`);
    // A row deleted since the count could leave an offset past the end;
    // then that and later chunks are simply empty.
    return res.map(r => (r.data?.[0]?.id as number | undefined) ?? 0);
  }, ["questions-edges", version], { revalidate: 86_400, tags: ["questions"] })();
  return { version, chunks, total, edges };
}

export async function getQuestionsManifest(): Promise<QuestionsManifest> {
  const { version, chunks, total } = await getBounds();
  return { version, chunks, total };
}

// Rows for one chunk of the current version, or "stale" when the caller's
// version is no longer current (the page then reloads its manifest rather
// than mixing chunks from two versions). A failed read throws, so it is
// never cached as an empty chunk.
export async function getQuestionsChunk(chunk: number, requestedVersion: string): Promise<Q[] | "stale" | "missing"> {
  const { version, chunks, edges } = await getBounds();
  if (requestedVersion !== version) return "stale";
  if (!Number.isInteger(chunk) || chunk < 0 || chunk >= chunks) return "missing";
  const hi = chunk === 0 ? null : edges[chunk - 1];          // inclusive
  const lo = chunk === chunks - 1 ? null : edges[chunk];     // exclusive
  return unstable_cache(async () => {
    const sb = supabaseAdmin();
    const rows: Q[] = [];
    // Keyset paging inside the chunk: each request continues below the last
    // id seen, so nothing shifts between requests.
    let below: number | null = null;
    for (;;) {
      let q = sb.from("questions").select(COLS).order("id", { ascending: false }).limit(REQUEST_ROWS);
      if (hi !== null) q = q.lte("id", hi);
      if (lo !== null) q = q.gt("id", lo);
      if (below !== null) q = q.lt("id", below);
      const { data, error } = await q;
      if (error) throw new Error(`questions chunk ${chunk} failed: ${error.message}`);
      const page = (data as unknown as Q[]) || [];
      rows.push(...page);
      if (page.length < REQUEST_ROWS) break;
      below = page[page.length - 1].id;
    }
    return rows;
  }, ["questions-chunk", version, String(chunk)], { revalidate: 86_400, tags: ["questions"] })();
}

// For Admin edits that change what learners see (topic fixes, topic renames
// and deletes): move the stamp so browsers fetch fresh chunks right away
// instead of keeping the old ones for up to a day.
export async function bumpQuestionsVersion() {
  const { error } = await supabaseAdmin().from("cache_versions")
    .upsert({ name: "questions", updated_at: new Date().toISOString() }, { onConflict: "name" });
  if (error) {
    // e.g. supabase/add_cache_versions.sql not run yet. The server cache is
    // still cleared below, but browsers keep their chunks for up to a day.
    console.error("cache_versions bump failed; learners may see the old topic for up to a day:", error.message);
  }
  revalidateTag("questions");
}

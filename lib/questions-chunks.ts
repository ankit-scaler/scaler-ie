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
// manifest (version + chunk count); the browser fetches each chunk from
// /api/questions/[chunk]?v=<version> and keeps it.
//
// The version comes from the data: newest questions.updated_at + row count
// + newest id. A trigger moves updated_at whenever a row's content changes
// (sync upsert, AI topic classification, Admin edits, edits made straight in
// Supabase; see supabase/add_questions_updated_at.sql), inserts move the
// newest id and deletes move the count. So any change gives a new version
// within VERSION_TTL, and a new version means new chunk URLs. Nights where
// the sheet didn't change keep the same version, so nothing is rebuilt.
// Until that migration is run, edits that don't add or remove rows can take
// up to FALLBACK_MAX_AGE to reach browsers.
//
// Chunks are fixed id ranges per version (boundaries worked out once per
// version), read with keyset paging, so rows inserted or deleted while a
// chunk is being read can't shift other rows out of it.

const ROWS_PER_CHUNK = 2000;          // ~0.7 MB at today's average row size: ~3x headroom under Next's 2 MB cache entry limit
const SIZE_WARN_BYTES = 1_500_000;    // log well before a chunk gets near that limit
const REQUEST_ROWS = 1000;            // Supabase's per-request row cap
const VERSION_TTL = 60;               // seconds a server reuses the version before re-checking
export const EXACT_MAX_AGE = 86_400;  // browser cache per chunk when the version tracks every change
export const FALLBACK_MAX_AGE = 3_600; // ...and when updated_at isn't there yet
const COLS = "id,program,company,role,round,question,related_topic,topic_ai";

type VersionInfo = { version: string; total: number; exact: boolean };

// Three tiny queries, at most once a minute (shared across server instances).
const getVersionInfo = unstable_cache(
  async (): Promise<VersionInfo> => {
    const sb = supabaseAdmin();
    const [countRes, newestRes, touchedRes] = await Promise.all([
      sb.from("questions").select("id", { count: "exact", head: true }),
      sb.from("questions").select("id").order("id", { ascending: false }).limit(1),
      sb.from("questions").select("updated_at").order("updated_at", { ascending: false }).limit(1),
    ]);
    if (countRes.error) throw new Error(`questions count failed: ${countRes.error.message}`);
    if (newestRes.error) throw new Error(`questions newest id failed: ${newestRes.error.message}`);
    const total = countRes.count ?? 0;
    const newest = (newestRes.data?.[0]?.id as number | undefined) ?? 0;
    // An error here means the updated_at migration hasn't been run yet.
    const exact = !touchedRes.error;
    const touched = exact && touchedRes.data?.[0]?.updated_at
      ? new Date(touchedRes.data[0].updated_at as string).getTime().toString(36) : "n";
    return { version: `${touched}.${total.toString(36)}.${newest.toString(36)}`, total, exact };
  },
  ["questions-version"],
  { revalidate: VERSION_TTL }
);

type Bounds = VersionInfo & { chunks: number; edges: number[] };

// edges[k-1] is the highest id in chunk k (k >= 1), newest first: chunk 0
// = ids above edges[0], chunk k = (edges[k], edges[k-1]], and the last
// chunk = everything at or below its edge. Every id falls in exactly one
// chunk, whatever changes later. Cached per version only — a new version
// gets new keys, so nothing ever needs invalidating.
async function getBounds(): Promise<Bounds> {
  const info = await getVersionInfo();
  const chunks = Math.max(1, Math.ceil(info.total / ROWS_PER_CHUNK));
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
  }, ["questions-edges", info.version], { revalidate: 86_400 })();
  return { ...info, chunks, edges };
}

export type QuestionsManifest = { version: string; chunks: number };

export async function getQuestionsManifest(): Promise<QuestionsManifest> {
  const { version, chunks } = await getBounds();
  return { version, chunks };
}

export type ChunkResult =
  | { kind: "rows"; rows: Q[]; maxAge: number }
  | { kind: "stale"; manifest: QuestionsManifest }
  | { kind: "missing" };

// Concurrent cold requests for the same chunk on one server instance share
// one Supabase read instead of each doing their own.
const inflight = new Map<string, Promise<Q[]>>();

// Rows for one chunk of the current version. If the caller's version is no
// longer current, returns the current manifest instead, so the page can
// switch to it rather than mixing chunks from two versions. A failed read
// throws, so it is never cached as an empty chunk.
export async function getQuestionsChunk(chunk: number, requestedVersion: string): Promise<ChunkResult> {
  const { version, chunks, edges, exact } = await getBounds();
  if (requestedVersion !== version) return { kind: "stale", manifest: { version, chunks } };
  if (!Number.isInteger(chunk) || chunk < 0 || chunk >= chunks) return { kind: "missing" };

  const key = `${version}:${chunk}`;
  let p = inflight.get(key);
  if (!p) {
    const hi = chunk === 0 ? null : edges[chunk - 1];          // inclusive
    const lo = chunk === chunks - 1 ? null : edges[chunk];     // exclusive
    p = unstable_cache(() => readRange(chunk, hi, lo), ["questions-chunk", version, String(chunk)], { revalidate: 86_400 })()
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return { kind: "rows", rows: await p, maxAge: exact ? EXACT_MAX_AGE : FALLBACK_MAX_AGE };
}

async function readRange(chunk: number, hi: number | null, lo: number | null): Promise<Q[]> {
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
  // Over 2 MB, Next silently stops caching this chunk on the server (browsers
  // still keep it). Shout well before that so ROWS_PER_CHUNK can be lowered.
  const bytes = JSON.stringify(rows).length;
  if (bytes > SIZE_WARN_BYTES) {
    console.warn(`questions chunk ${chunk} is ${(bytes / 1e6).toFixed(2)} MB (${rows.length} rows); lower ROWS_PER_CHUNK in lib/questions-chunks.ts before it passes Next's 2 MB cache limit`);
  }
  return rows;
}

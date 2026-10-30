import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-server";

// Why this exists: Next's data cache (which unstable_cache uses) silently
// refuses to store any single entry over 2 MB in production — see
// node_modules/next/dist/server/lib/incremental-cache/index.js, "items over
// 2MB can not be cached". The Questions table as one entry is ~3.7 MB, so it
// was never cached and every page view re-downloaded the whole table from
// Supabase. Here a table is cached in chunks well under that limit.
//
// And why a version: a short revalidate (the old 300s) barely helps at a few
// visits a day — almost every visit lands after expiry and reloads anyway.
// So chunks are kept for a day, keyed by the dataset's stamp in the
// cache_versions table, which the sync jobs bump when they finish: new data
// shows up on the next view after a sync, and not a whole reload before.

const ROWS_PER_CHUNK = 2500;  // ~0.8 MB of question rows; well under 2 MB
const REQUEST_ROWS = 1000;    // Supabase's per-request row cap
const WARN_BYTES = 1.5 * 1024 * 1024;

export type Dataset = "questions" | "assignments" | "jobs";

// The stamps themselves are read at most once a minute. If the table isn't
// there yet (migration not run), callers fall back to an hourly cache.
const getVersions = unstable_cache(
  async (): Promise<Record<string, string> | null> => {
    const { data, error } = await supabaseAdmin().from("cache_versions").select("name,updated_at");
    if (error || !data) return null;
    return Object.fromEntries(data.map((r: { name: string; updated_at: string }) => [r.name, r.updated_at]));
  },
  ["cache-versions"],
  { revalidate: 60, tags: ["cache-versions"] }
);

export async function fetchTableCached<T extends { id: number }>({
  dataset, table, select, filter, keyExtra = "",
}: {
  dataset: Dataset;
  table: string;
  select: string;
  filter?: (q: any) => any;
  keyExtra?: string;  // anything else the filter depends on, e.g. a date cutoff
}): Promise<T[]> {
  const versions = await getVersions();
  const stamp = versions?.[dataset];
  const version = stamp ?? `hour-${Math.floor(Date.now() / 3_600_000)}`;
  const opts = { revalidate: stamp ? 86_400 : 3_600, tags: [dataset] };
  const key = [dataset, table, select, keyExtra, version];
  const sb = () => supabaseAdmin();
  const applyFilter = (q: any) => (filter ? filter(q) : q);

  const total = await unstable_cache(async () => {
    const { count } = await applyFilter(sb().from(table).select("id", { count: "exact", head: true }));
    return count ?? 0;
  }, [...key, "count"], opts)();
  if (total === 0) return [];

  const chunks = await Promise.all(
    Array.from({ length: Math.ceil(total / ROWS_PER_CHUNK) }, (_, c) =>
      unstable_cache(async () => {
        const from = c * ROWS_PER_CHUNK;
        const to = Math.min(from + ROWS_PER_CHUNK, total) - 1;
        const requests = [];
        for (let start = from; start <= to; start += REQUEST_ROWS) {
          requests.push(applyFilter(sb().from(table).select(select))
            .order("id", { ascending: false })
            .range(start, Math.min(start + REQUEST_ROWS - 1, to)));
        }
        const rows = (await Promise.all(requests)).flatMap((r: any) => (r.data as T[]) || []);
        const bytes = JSON.stringify(rows).length;
        if (bytes > WARN_BYTES) {
          console.warn(`[cached-table] ${dataset} chunk ${c} is ${(bytes / 1048576).toFixed(2)} MB — lower ROWS_PER_CHUNK before it passes 2 MB and stops caching.`);
        }
        return rows;
      }, [...key, "chunk", String(c)], opts)()
    )
  );

  // Rows can shift between chunk boundaries if the table changed between
  // the count and the chunk reads; drop any duplicate ids that causes.
  const seen = new Set<number>();
  return chunks.flat().filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

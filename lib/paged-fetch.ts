import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-server";
import { CHUNK_ROWS, mergeChunks, pageCount } from "@/lib/chunk-utils";

// Same read as fetchAllRows, but cached PER 1000-ROW PAGE instead of as one
// value. Vercel's Data Cache refuses any single item over 2 MB, and a table
// like `questions` (~4.5 MB as JSON) can never fit as one entry — so wrapping
// fetchAllRows in unstable_cache silently cached nothing and every page load
// re-ran ~15 queries. Each page here is ~340 KB, so it is actually stored.
// An error throws (nothing is cached for it) rather than silently returning a
// short list; a previously cached copy keeps being served meanwhile.
export async function cachedPagedRows<T extends { id: number }>(opts: {
  keyBase: string; table: string; select: string; revalidate: number; tags: string[];
}): Promise<T[]> {
  const { keyBase, table, select, revalidate, tags } = opts;
  const cacheOpts = { revalidate, tags };

  const getCount = unstable_cache(async () => {
    const { count, error } = await supabaseAdmin().from(table).select("id", { count: "exact", head: true });
    if (error) throw new Error(`${table} count: ${error.message}`);
    return count ?? 0;
  }, [keyBase, "count"], cacheOpts);

  const total = await getCount();
  const getPage = (i: number) =>
    unstable_cache(async () => {
      const { data, error } = await supabaseAdmin()
        .from(table).select(select).order("id", { ascending: false })
        .range(i * CHUNK_ROWS, i * CHUNK_ROWS + CHUNK_ROWS - 1);
      if (error) throw new Error(`${table} page ${i}: ${error.message}`);
      return (data ?? []) as unknown as T[];
    }, [keyBase, "page", String(i)], cacheOpts)();

  const chunks = await Promise.all(Array.from({ length: pageCount(total) }, (_, i) => getPage(i)));
  return mergeChunks(chunks);
}

// Supabase caps a single request at 1000 rows. Fetches every page in
// parallel (after one count query) instead of awaiting pages one at a
// time — for tables with 10k+ rows this turns ~11 sequential round trips
// into 1 round trip's worth of latency.
export async function fetchAllRows<T>(
  table: string, select: string,
  filter?: (q: any) => any
): Promise<T[]> {
  const sb = supabaseAdmin();
  const PAGE = 1000;
  const applyFilter = (q: any) => (filter ? filter(q) : q);

  const { count } = await applyFilter(sb.from(table).select("id", { count: "exact", head: true }));
  const total = count ?? 0;
  if (total === 0) return [];

  const pages = Math.ceil(total / PAGE);
  const chunks = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      applyFilter(sb.from(table).select(select)).order("id", { ascending: false }).range(i * PAGE, i * PAGE + PAGE - 1)
    )
  );
  return chunks.flatMap(c => (c.data as T[]) || []);
}

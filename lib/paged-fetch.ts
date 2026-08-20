import { supabaseAdmin } from "@/lib/supabase-server";

// Supabase caps a single request at 1000 rows. Fetches every page in
// parallel (after one count query) instead of awaiting pages one at a
// time — for tables with 10k+ rows this turns ~11 sequential round trips
// into 1 round trip's worth of latency.
export async function fetchAllRows<T>(table: string, select: string): Promise<T[]> {
  const sb = supabaseAdmin();
  const PAGE = 1000;
  const { count } = await sb.from(table).select("id", { count: "exact", head: true });
  const total = count ?? 0;
  if (total === 0) return [];

  const pages = Math.ceil(total / PAGE);
  const chunks = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      sb.from(table).select(select).order("id", { ascending: false }).range(i * PAGE, i * PAGE + PAGE - 1)
    )
  );
  return chunks.flatMap(c => (c.data as T[]) || []);
}

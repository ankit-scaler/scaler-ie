// Pure helpers for cachedPagedRows() in lib/paged-fetch.ts (kept separate so
// they can be tested in Node without Next.js).

// One cached chunk = one Supabase page (PostgREST caps a request at 1000 rows).
// 1000 questions is ~340 KB as JSON, comfortably under Vercel's 2 MB limit
// per cached item (the whole 13K-row table is ~4.5 MB and can't be cached whole).
export const CHUNK_ROWS = 1000;

// Cache key for the Questions data. The nightly sync's "last synced" time is part
// of the key: a new sync time = a new key = a fresh read, so learners get new
// questions right after the sync. "none" (marker missing) keeps one stable key.
export function questionsCacheKey(version: string | null | undefined): string {
  const v = (version ?? "").trim();
  return `all-questions:${v || "none"}`;
}

export function pageCount(total: number, size: number = CHUNK_ROWS): number {
  return total > 0 ? Math.ceil(total / size) : 0;
}

// Chunks are cached independently, so around a refresh two of them can briefly
// overlap or leave a gap if rows were added between their reads. De-duplicate
// by id and return newest first, same order as the old single fetch.
export function mergeChunks<T extends { id: number }>(chunks: (T[] | null | undefined)[]): T[] {
  const seen = new Set<number>();
  const out: T[] = [];
  for (const chunk of chunks) {
    for (const row of chunk ?? []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
  }
  return out.sort((a, b) => b.id - a.id);
}

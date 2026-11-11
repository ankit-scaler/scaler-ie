"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import QuestionsView, { Q } from "./QuestionsView";
import { FlightSpinner } from "./FlightLoader";

// Fetches the question list chunk by chunk (see lib/questions-chunks.ts),
// then hands it to QuestionsView exactly as the server used to. The browser
// keeps each chunk (per data version, up to a day), so repeat visits cost
// the server almost nothing.
const PARALLEL = 2;  // spreads the work when the server has to build fresh chunks after a sync

const STALE = "stale";

export default function QuestionsLoader({ version, chunks }: { version: string; chunks: number }) {
  const router = useRouter();
  const [rows, setRows] = useState<Q[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const refreshes = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setRows(null);       // never show one version's rows while loading another
    setFailed(false);
    if (!version || chunks < 1) { setFailed(true); return; }

    const load = (i: number) =>
      fetch(`/api/questions/${i}?v=${encodeURIComponent(version)}`).then(r => {
        if (r.status === 409) throw new Error(STALE);
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<Q[]>;
      });

    (async () => {
      const parts: Q[][] = new Array(chunks);
      let next = 0, stop = false;
      const worker = async () => {
        while (!cancelled && !stop && next < chunks) {
          const i = next++;
          try { parts[i] = await load(i); } catch (e) { stop = true; throw e; }
        }
      };
      await Promise.all(Array.from({ length: Math.min(PARALLEL, chunks) }, worker));
      if (cancelled) return;
      const seen = new Set<number>();
      setRows(parts.flat().filter(q => (seen.has(q.id) ? false : (seen.add(q.id), true))));
    })().catch(e => {
      if (cancelled) return;
      // The data changed mid-load (e.g. a sync just finished): fetch the new
      // manifest, after a short wait in case servers briefly disagree on the
      // version. Capped, so it can't loop forever.
      // If the new manifest has a new version, this effect re-runs with it;
      // if not (yet), the follow-up attempt retries with what we have.
      if (e instanceof Error && e.message === STALE && refreshes.current < 3) {
        refreshes.current++;
        const wait = 1000 * refreshes.current;
        setTimeout(() => {
          if (cancelled) return;
          router.refresh();
          setTimeout(() => { if (!cancelled) setAttempt(a => a + 1); }, 2000);
        }, wait);
        return;
      }
      setFailed(true);
    });
    return () => { cancelled = true; };
  }, [version, chunks, attempt, router]);

  if (rows) return <QuestionsView initial={rows} />;
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-mute">
      {failed ? (
        <>
          <p>Couldn&apos;t load the questions.</p>
          <button
            type="button"
            onClick={() => { refreshes.current = 0; if (!version) router.refresh(); else setAttempt(a => a + 1); }}
            className="rounded-full border border-edge px-4 py-2 text-sm text-text transition-colors hover:border-text/40"
          >Try again</button>
        </>
      ) : (
        <>
          <FlightSpinner className="h-6 w-6" />
          <p className="text-sm">Loading questions…</p>
        </>
      )}
    </div>
  );
}

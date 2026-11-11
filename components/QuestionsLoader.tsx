"use client";
import { useEffect, useState } from "react";
import QuestionsView, { Q } from "./QuestionsView";
import { FlightSpinner } from "./FlightLoader";

// Fetches the question list chunk by chunk (see lib/questions-chunks.ts),
// then hands it to QuestionsView exactly as the server used to. Chunks are
// cached by the browser per data version, so after the first visit this is
// instant and costs the server nothing.
export default function QuestionsLoader({ version, chunks }: { version: string; chunks: number }) {
  const [rows, setRows] = useState<Q[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    Promise.all(
      Array.from({ length: chunks }, (_, i) =>
        fetch(`/api/questions/${i}?v=${encodeURIComponent(version)}`).then(r => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json() as Promise<Q[]>;
        })
      )
    ).then(parts => {
      if (cancelled) return;
      const seen = new Set<number>();
      setRows(parts.flat().filter(q => (seen.has(q.id) ? false : (seen.add(q.id), true))));
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [version, chunks, attempt]);

  if (rows) return <QuestionsView initial={rows} />;
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-mute">
      {failed ? (
        <>
          <p>Couldn&apos;t load the questions.</p>
          <button
            type="button"
            onClick={() => setAttempt(a => a + 1)}
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

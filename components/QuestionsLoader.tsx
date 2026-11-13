"use client";
import { useEffect, useState } from "react";
import QuestionsView, { Q } from "./QuestionsView";
import { FlightSpinner } from "./FlightLoader";

// Fetches the question list chunk by chunk (see lib/questions-chunks.ts),
// then hands it to QuestionsView exactly as the server used to. The browser
// keeps each chunk per data version, so repeat visits cost the server almost
// nothing and load from disk cache.
const PARALLEL = 2;      // spreads the work when the server has to build fresh chunks
const MAX_SWITCHES = 3;  // version changes followed within one load before giving up

type Manifest = { version: string; chunks: number };
type List = { version: string; rows: Q[] };

// The last list loaded in this tab. Coming back to Questions from another
// page with the same version shows it at once: no spinner, no refetch or
// rebuild. (Filters live in the URL, so they come back too.)
let lastLoaded: List | null = null;

async function loadAll(start: Manifest, isCancelled: () => boolean): Promise<List | null> {
  let m = start;
  // Each pass loads one version. If the data changes mid-load, the server
  // answers 409 with the new manifest and the next pass loads that instead,
  // all inside this one call, so nothing on screen resets while it happens.
  for (let pass = 0; pass <= MAX_SWITCHES; pass++) {
    if (lastLoaded?.version === m.version) return lastLoaded;
    const cur = m;
    const parts: Q[][] = new Array(cur.chunks);
    let next = 0;
    let newer: Manifest | null = null;
    const worker = async () => {
      while (!isCancelled() && !newer && next < cur.chunks) {
        const i = next++;
        const r = await fetch(`/api/questions/${i}?v=${encodeURIComponent(cur.version)}`);
        if (r.status === 409) {
          const body = await r.json().catch(() => null);
          if (!body?.version) throw new Error("stale without manifest");
          newer = { version: body.version, chunks: body.chunks };
          return;
        }
        if (!r.ok) throw new Error(`chunk ${i}: ${r.status}`);
        parts[i] = await r.json();
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, cur.chunks) }, worker));
    if (isCancelled()) return null;
    if (newer) { m = newer; continue; }
    const seen = new Set<number>();
    lastLoaded = { version: cur.version, rows: parts.flat().filter(q => (seen.has(q.id) ? false : (seen.add(q.id), true))) };
    return lastLoaded;
  }
  throw new Error("question data kept changing during load");
}

export default function QuestionsLoader({ version, chunks }: { version: string; chunks: number }) {
  // `for` is the page's version this list was loaded for (the list itself
  // may be newer if the data changed mid-load). A list loaded for another
  // page version is never shown.
  const [shown, setShown] = useState<{ for: string; list: List } | null>(
    () => (lastLoaded && lastLoaded.version === version ? { for: version, list: lastLoaded } : null)
  );
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (shown?.for === version && !attempt) return;
    let cancelled = false;
    setFailed(false);
    if (!version || chunks < 1) { setFailed(true); return; }
    loadAll({ version, chunks }, () => cancelled)
      .then(list => { if (!cancelled && list) setShown({ for: version, list }); })
      .catch(e => { console.error(e); if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
    // `shown` is read only to skip a load already done for this version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, chunks, attempt]);

  if (shown?.for === version) return <QuestionsView initial={shown.list.rows} />;
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-mute">
      {failed ? (
        <>
          <p>Couldn&apos;t load the questions.</p>
          <button
            type="button"
            onClick={() => (version ? setAttempt(a => a + 1) : window.location.reload())}
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

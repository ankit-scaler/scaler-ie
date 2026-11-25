"use client";
import { useEffect, useState } from "react";
import { FlightSpinner } from "./FlightLoader";
import { Card } from "./AdminShared";

type Grain = "day" | "week" | "month";
type Payload = { periods: string[]; counts: Record<string, Record<string, number>> };

const GRAINS: { k: Grain; label: string; hint: string }[] = [
  { k: "day", label: "DOD", hint: "Last 4 full days" },
  { k: "week", label: "WOW", hint: "Last 4 full weeks (Mon–Sun)" },
  { k: "month", label: "MOM", hint: "Last 4 full months" },
];

const ROWS: { k: string; label: string; desc: string }[] = [
  { k: "app", label: "App unique users", desc: "Users who opened the app" },
  { k: "questions", label: "Unique users visiting Questions", desc: "Users on the Questions tab" },
  { k: "assignments", label: "Unique users visiting Assignments", desc: "Users on the Assignments tab" },
  { k: "packets", label: "Unique users visiting Packets", desc: "Users on the Packets tab" },
  { k: "trending", label: "Trending roles", desc: "Users on the Trending roles tab" },
  { k: "hiring", label: "Hiring", desc: "Users on the Hiring tab" },
  { k: "crash_course", label: "Crash Course", desc: "Users who clicked Crash Course (counted from the day click tracking went live)" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dm = (s: string) => `${Number(s.slice(8, 10))} ${MONTHS[Number(s.slice(5, 7)) - 1]}`;
function periodLabel(grain: Grain, start: string) {
  if (grain === "day") return dm(start);
  if (grain === "month") return `${MONTHS[Number(start.slice(5, 7)) - 1]} ${start.slice(0, 4)}`;
  const end = new Date(new Date(`${start}T00:00:00Z`).getTime() + 6 * 86400_000).toISOString().slice(0, 10);
  return `${dm(start)} – ${dm(end)}`;
}

// % change vs the next-older period. null = can't compute (previous was 0).
function change(cur: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}
const fmtChange = (c: number | null, cur: number) =>
  c === null ? (cur > 0 ? "new" : "–") : `${c > 0 ? "+" : ""}${c}%`;

export default function PeriodMetrics({ downloadCsv }: { downloadCsv: (filename: string, rows: (string | number)[][]) => void }) {
  const [grain, setGrain] = useState<Grain>("day");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true); setError(null);
    fetch(`/api/admin/period-stats?grain=${grain}`, { signal: ctrl.signal })
      .then(async r => {
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(j?.error || `Request failed (${r.status})`);
        setData({ periods: j.periods, counts: j.counts });
      })
      .catch(e => { if (e?.name !== "AbortError") setError(String(e?.message || e)); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [grain]);

  // 5 periods come back (newest first): show 4, the 5th only feeds the change of the 4th.
  const shown = data ? data.periods.slice(0, 4) : [];
  const cell = (metric: string, i: number) => {
    const cur = data!.counts[metric][data!.periods[i]] ?? 0;
    const prev = data!.counts[metric][data!.periods[i + 1]] ?? 0;
    return { cur, ch: change(cur, prev) };
  };

  const download = () => {
    if (!data) return;
    const head: (string | number)[] = ["Metric", "Description"];
    shown.forEach(p => { head.push(periodLabel(grain, p), `${periodLabel(grain, p)} change vs previous`); });
    const rows: (string | number)[][] = [head];
    ROWS.forEach(r => {
      const line: (string | number)[] = [r.label, r.desc];
      shown.forEach((_, i) => { const c = cell(r.k, i); line.push(c.cur, fmtChange(c.ch, c.cur)); });
      rows.push(line);
    });
    downloadCsv(`admin-usage-${GRAINS.find(g => g.k === grain)!.label.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  return (
    <Card
      title="App & tab usage — unique users"
      accent="acad"
      action={
        <div className="flex items-center gap-2">
          <div className="flex gap-1" role="group" aria-label="Period">
            {GRAINS.map(g => (
              <button
                key={g.k}
                onClick={() => setGrain(g.k)}
                disabled={loading}
                title={g.hint}
                aria-pressed={grain === g.k}
                className={`rounded-full border px-3 py-1 text-sm transition disabled:cursor-wait disabled:opacity-60 ${grain === g.k ? "border-text bg-text text-ink" : "border-edge text-mute hover:text-text"}`}
              >{g.label}</button>
            ))}
          </div>
          <button
            onClick={download}
            disabled={loading || !data}
            className="rounded-full bg-text px-3.5 py-1.5 text-sm font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
          >Download CSV</button>
        </div>
      }
    >
      {error ? (
        <div className="rounded-xl border border-devops/40 bg-devops/10 px-4 py-3 text-sm text-devops">{error}</div>
      ) : loading || !data ? (
        <div className="flex h-48 items-center justify-center text-mute"><FlightSpinner className="h-6 w-6" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-edge text-left font-mono text-[11px] uppercase tracking-widest text-mute">
                <th className="py-2 pr-4 font-bold">Metric</th>
                {shown.map(p => <th key={p} className="px-3 py-2 text-right font-bold">{periodLabel(grain, p)}</th>)}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(r => (
                <tr key={r.k} className="border-b border-edge/60 last:border-0">
                  <td className="py-2.5 pr-4" title={r.desc}>{r.label}</td>
                  {shown.map((p, i) => {
                    const { cur, ch } = cell(r.k, i);
                    const color = ch === null ? "text-mute" : ch > 0 ? "text-emerald-500" : ch < 0 ? "text-red-500" : "text-mute";
                    return (
                      <td key={p} className="px-3 py-2.5 text-right tabular-nums">
                        <span className="font-medium">{cur.toLocaleString()}</span>
                        <span className={`ml-2 text-xs ${color}`}>{fmtChange(ch, cur)}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-mute">
            Each learner counts once per period. Change is vs the period before it. The current, unfinished period is not shown. Internal @scaler.com accounts are excluded. Days are IST.
          </p>
        </div>
      )}
    </Card>
  );
}

"use client";
import { useState } from "react";
import { CANONICAL_TOPICS } from "@/lib/topics";

type Row = {
  id: number; company: string; role: string; program: string | null;
  question: string; related_topic: string | null; topic_ai: string | null;
};

export default function QuestionTopicsManager() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  const search = async () => {
    const qL = query.trim();
    if (!qL) { setRows([]); setSearched(false); return; }
    setLoading(true);
    const res = await fetch(`/api/admin/questions?q=${encodeURIComponent(qL)}`);
    const j = await res.json().catch(() => ({ ok: false }));
    setLoading(false);
    setSearched(true);
    if (j.ok) { setRows(j.rows); setError(null); }
    else setError(res.status === 403 ? "Not authorized." : "Couldn't search questions.");
  };

  const updateTopic = async (id: number, topic_ai: string) => {
    setSavingId(id);
    const res = await fetch("/api/admin/questions", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "update", id, topic_ai }),
    });
    const j = await res.json().catch(() => ({ ok: false }));
    setSavingId(null);
    if (j.ok) setRows(rs => rs.map(r => r.id === id ? { ...r, topic_ai } : r));
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-edge bg-panel p-5 shadow-card">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-topic" />
      <div className="mb-1 font-mono text-xs font-bold uppercase tracking-widest text-topic">Fix a question's topic</div>
      <p className="mb-4 text-sm text-mute">
        Search by question id, company, role, or keywords in the question text, then override its Topic filter
        value directly. Once you save a change here, this question is marked as manually fixed — future
        "Backfill AI Topics" reclassification runs skip it, so your correction sticks.
      </p>

      <div className="mb-4 flex gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && search()}
          placeholder="search by id, company, role, or question text..."
          className="min-w-0 flex-1 rounded-xl border border-edge bg-panel2 px-3 py-2 text-sm text-text placeholder:text-mute/60 focus:border-acad focus:outline-none"
        />
        <button
          onClick={search}
          disabled={loading}
          className="rounded-xl bg-text px-3.5 py-2 text-sm font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
        >{loading ? "Searching…" : "Search"}</button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-devops/40 bg-devops/10 px-3 py-2 text-sm text-devops">{error}</div>
      )}

      {searched && !error && rows.length === 0 && (
        <div className="rounded-xl border border-edge/60 bg-panel2 px-3 py-2 text-sm text-mute">No matching questions.</div>
      )}

      {rows.length > 0 && (
        <div className="max-h-[480px] space-y-3 overflow-y-auto">
          {rows.map(r => (
            <div key={r.id} className="rounded-xl border border-edge/60 bg-panel2 p-3">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-mute">
                <span>#{r.id}</span>
                <span>·</span>
                <span>{r.company}</span>
                <span>·</span>
                <span>{r.role}</span>
                {r.related_topic && (<><span>·</span><span>raw tag: {r.related_topic}</span></>)}
              </div>
              <p className="mb-2 text-sm text-text">{r.question}</p>
              <div className="flex items-center gap-2">
                <select
                  value={r.topic_ai || ""}
                  onChange={e => updateTopic(r.id, e.target.value)}
                  disabled={savingId === r.id}
                  className="rounded-lg border border-edge bg-panel px-2 py-1 text-sm text-text focus:border-acad focus:outline-none disabled:opacity-50"
                >
                  <option value="">— none —</option>
                  {CANONICAL_TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {savingId === r.id && <span className="text-xs text-mute">Saving…</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

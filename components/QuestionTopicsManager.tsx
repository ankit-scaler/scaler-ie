"use client";
import { useEffect, useState } from "react";

type Row = {
  id: number; company: string; role: string; program: string | null;
  question: string; related_topic: string | null; topic_ai: string | null;
};
type Topic = { id: number; name: string; count: number };

const NEW_TOPIC_VALUE = "__new__";
const PAGE_SIZE = 50;

export default function QuestionTopicsManager() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const topicNames = topics.map(t => t.name);

  const loadTopics = () => {
    fetch("/api/admin/topics").then(r => r.json()).then(j => {
      if (j.ok) setTopics(j.topics);
    }).catch(() => {});
  };
  useEffect(() => { loadTopics(); }, []);

  // ---- Browse by topic ----
  const [browseTopic, setBrowseTopic] = useState("");
  const [browseRows, setBrowseRows] = useState<Row[]>([]);
  const [browsePage, setBrowsePage] = useState(0);
  const [browseTotal, setBrowseTotal] = useState(0);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchBrowsePage = async (topic: string, page: number) => {
    setBrowseLoading(true);
    const res = await fetch(`/api/admin/questions?topic=${encodeURIComponent(topic)}&page=${page}`);
    const j = await res.json().catch(() => ({ ok: false }));
    setBrowseLoading(false);
    if (j.ok) { setBrowseRows(j.rows); setBrowseTotal(j.total); setBrowsePage(page); setBrowseError(null); }
    else setBrowseError(res.status === 403 ? "Not authorized." : "Couldn't load questions.");
  };

  const onTopicPicked = (value: string) => {
    if (value === NEW_TOPIC_VALUE) {
      setCreatingTopic(true);
      setNewTopicName("");
      return;
    }
    setCreatingTopic(false);
    setBrowseTopic(value);
    setBrowseRows([]);
    setBrowseTotal(0);
    if (value) fetchBrowsePage(value, 0);
  };

  const createTopic = async () => {
    const name = newTopicName.trim();
    if (!name) return;
    setCreating(true);
    const res = await fetch("/api/admin/topics", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const j = await res.json().catch(() => ({ ok: false }));
    setCreating(false);
    if (j.ok) {
      loadTopics();
      setCreatingTopic(false);
      setBrowseTopic(name);
      setBrowseRows([]);
      setBrowseTotal(0);
    } else {
      setBrowseError(j.error || "Couldn't create topic.");
    }
  };

  // ---- Keyword search ----
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // ---- Shared: updating a question's topic ----
  const [savingId, setSavingId] = useState<number | null>(null);

  const updateTopic = async (id: number, topic_ai: string) => {
    setSavingId(id);
    const res = await fetch("/api/admin/questions", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "update", id, topic_ai }),
    });
    const j = await res.json().catch(() => ({ ok: false }));
    setSavingId(null);
    if (!j.ok) return;
    setRows(rs => rs.map(r => r.id === id ? { ...r, topic_ai } : r));
    // In browse mode a question that just moved to a different topic no
    // longer belongs in the list being viewed — drop it rather than leave
    // a row whose topic contradicts the dropdown above it.
    setBrowseRows(rs => {
      if (topic_ai === browseTopic) return rs.map(r => r.id === id ? { ...r, topic_ai } : r);
      return rs.filter(r => r.id !== id);
    });
    if (browseTopic && topic_ai !== browseTopic) setBrowseTotal(t => Math.max(0, t - 1));
    loadTopics(); // counts shifted
  };

  const totalPages = Math.max(1, Math.ceil(browseTotal / PAGE_SIZE));

  return (
    <div className="relative overflow-hidden rounded-2xl border border-edge bg-panel p-5 shadow-card">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-topic" />
      <div className="mb-1 font-mono text-xs font-bold uppercase tracking-widest text-topic">Fix a question's topic</div>
      <p className="mb-4 text-sm text-mute">
        Saving a change here marks that question as manually fixed — future "Backfill AI Topics" runs skip it, so
        your correction sticks.
      </p>

      {/* Browse by topic */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select
          value={browseTopic}
          onChange={e => onTopicPicked(e.target.value)}
          className="rounded-xl border border-edge bg-panel2 px-3 py-2 text-sm text-text focus:border-acad focus:outline-none"
        >
          <option value="">Browse by topic…</option>
          {topics.map(t => <option key={t.id} value={t.name}>{t.name} ({t.count})</option>)}
          <option value={NEW_TOPIC_VALUE}>+ Create new topic…</option>
        </select>

        {creatingTopic && (
          <>
            <input
              value={newTopicName}
              onChange={e => setNewTopicName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && createTopic()}
              placeholder="new topic name..."
              autoFocus
              className="min-w-0 flex-1 rounded-xl border border-acad bg-panel2 px-3 py-2 text-sm text-text placeholder:text-mute/60 focus:outline-none"
            />
            <button
              onClick={createTopic}
              disabled={creating || !newTopicName.trim()}
              className="rounded-xl bg-text px-3.5 py-2 text-sm font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
            >{creating ? "Creating…" : "Create"}</button>
            <button
              onClick={() => setCreatingTopic(false)}
              className="rounded-xl border border-edge px-3 py-2 text-sm text-mute hover:text-text"
            >Cancel</button>
          </>
        )}
      </div>

      {browseError && (
        <div className="mb-3 rounded-xl border border-devops/40 bg-devops/10 px-3 py-2 text-sm text-devops">{browseError}</div>
      )}

      {browseTopic && !creatingTopic && (
        <div className="mb-6">
          {browseLoading ? (
            <div className="py-3 text-sm text-mute">Loading…</div>
          ) : browseRows.length === 0 ? (
            <div className="rounded-xl border border-edge/60 bg-panel2 px-3 py-2 text-sm text-mute">
              No questions currently have this topic.
            </div>
          ) : (
            <>
              <div className="max-h-[480px] space-y-3 overflow-y-auto">
                {browseRows.map(r => (
                  <QuestionRow key={r.id} row={r} topicNames={topicNames} saving={savingId === r.id} onChangeTopic={updateTopic} />
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-mute">
                <span>{browseTotal} question{browseTotal === 1 ? "" : "s"} · page {browsePage + 1} of {totalPages}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => fetchBrowsePage(browseTopic, browsePage - 1)}
                    disabled={browsePage === 0}
                    className="rounded-lg border border-edge px-2.5 py-1 hover:text-text disabled:opacity-40"
                  >Prev</button>
                  <button
                    onClick={() => fetchBrowsePage(browseTopic, browsePage + 1)}
                    disabled={browsePage + 1 >= totalPages}
                    className="rounded-lg border border-edge px-2.5 py-1 hover:text-text disabled:opacity-40"
                  >Next</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Keyword search */}
      <div className="mb-1 font-mono text-[11px] font-bold uppercase tracking-widest text-mute">Or search directly</div>
      <div className="mb-4 mt-2 flex gap-2">
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
            <QuestionRow key={r.id} row={r} topicNames={topicNames} saving={savingId === r.id} onChangeTopic={updateTopic} />
          ))}
        </div>
      )}
    </div>
  );
}

function QuestionRow({ row, topicNames, saving, onChangeTopic }: {
  row: Row; topicNames: string[]; saving: boolean; onChangeTopic: (id: number, topic: string) => void;
}) {
  return (
    <div className="rounded-xl border border-edge/60 bg-panel2 p-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-mute">
        <span>#{row.id}</span>
        <span>·</span>
        <span>{row.company}</span>
        <span>·</span>
        <span>{row.role}</span>
        {row.related_topic && (<><span>·</span><span>raw tag: {row.related_topic}</span></>)}
      </div>
      <p className="mb-2 text-sm text-text">{row.question}</p>
      <div className="flex items-center gap-2">
        <select
          value={row.topic_ai || ""}
          onChange={e => onChangeTopic(row.id, e.target.value)}
          disabled={saving}
          className="rounded-lg border border-edge bg-panel px-2 py-1 text-sm text-text focus:border-acad focus:outline-none disabled:opacity-50"
        >
          <option value="">— none —</option>
          {topicNames.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {saving && <span className="text-xs text-mute">Saving…</span>}
      </div>
    </div>
  );
}

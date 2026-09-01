"use client";
import { useEffect, useState } from "react";

type Topic = { id: number; name: string; count: number };
type Orphan = { name: string; count: number };

export default function TopicsManager() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [orphans, setOrphans] = useState<Orphan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [busyName, setBusyName] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/admin/topics");
    const j = await res.json().catch(() => ({ ok: false }));
    setLoading(false);
    if (j.ok) { setTopics(j.topics); setOrphans(j.orphans || []); setError(null); }
    else setError(res.status === 403 ? "Not authorized." : "Couldn't load topics.");
  };

  useEffect(() => { load(); }, []);

  const addTopic = async () => {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    const res = await fetch("/api/admin/topics", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const j = await res.json().catch(() => ({ ok: false }));
    setAdding(false);
    if (j.ok) { setNewName(""); load(); }
    else setError(j.error || "Couldn't add topic.");
  };

  const startRename = (t: Topic) => { setEditingId(t.id); setEditValue(t.name); setError(null); };
  const cancelRename = () => { setEditingId(null); setEditValue(""); };

  const saveRename = async (oldName: string) => {
    const newVal = editValue.trim();
    if (!newVal || newVal === oldName) { cancelRename(); return; }
    setBusyName(oldName);
    const res = await fetch("/api/admin/topics", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ oldName, newName: newVal }),
    });
    const j = await res.json().catch(() => ({ ok: false }));
    setBusyName(null);
    if (j.ok) { cancelRename(); load(); }
    else setError(j.error || "Couldn't rename topic.");
  };

  const deleteTopic = async (name: string) => {
    if (!confirm(`Delete topic "${name}"? Only possible while it has 0 questions.`)) return;
    setBusyName(name);
    const res = await fetch("/api/admin/topics", {
      method: "DELETE", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const j = await res.json().catch(() => ({ ok: false }));
    setBusyName(null);
    if (j.ok) load();
    else setError(j.error || "Couldn't delete topic.");
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-edge bg-panel p-5 shadow-card">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-topic" />
      <div className="mb-1 font-mono text-xs font-bold uppercase tracking-widest text-topic">Manage topics</div>
      <p className="mb-4 text-sm text-mute">
        Add, rename, or delete entries in the canonical Topic taxonomy. This is the same list the nightly AI
        classifier picks from — a topic you add here is usable by it (and the "Fix a question's topic" editor)
        immediately, no deploy needed. A topic can only be deleted while it has 0 questions; renaming re-points
        every question already using it.
      </p>

      <div className="mb-4 flex gap-2">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addTopic()}
          placeholder="new topic name..."
          className="min-w-0 flex-1 rounded-xl border border-edge bg-panel2 px-3 py-2 text-sm text-text placeholder:text-mute/60 focus:border-acad focus:outline-none"
        />
        <button
          onClick={addTopic}
          disabled={adding || !newName.trim()}
          className="rounded-xl bg-text px-3.5 py-2 text-sm font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
        >{adding ? "Adding…" : "Add topic"}</button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-devops/40 bg-devops/10 px-3 py-2 text-sm text-devops">{error}</div>
      )}

      {loading ? (
        <div className="text-sm text-mute">Loading…</div>
      ) : (
        <div className="max-h-[420px] space-y-1.5 overflow-y-auto">
          {topics.map(t => (
            <div key={t.id} className="flex items-center gap-2 rounded-lg border border-edge/60 bg-panel2 px-3 py-1.5">
              {editingId === t.id ? (
                <>
                  <input
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveRename(t.name); if (e.key === "Escape") cancelRename(); }}
                    autoFocus
                    className="min-w-0 flex-1 rounded-lg border border-acad bg-panel px-2 py-1 text-sm text-text focus:outline-none"
                  />
                  <button onClick={() => saveRename(t.name)} disabled={busyName === t.name}
                    className="rounded-lg bg-text px-2.5 py-1 text-xs font-medium text-ink hover:opacity-90 disabled:opacity-50">
                    {busyName === t.name ? "Saving…" : "Save"}
                  </button>
                  <button onClick={cancelRename} className="rounded-lg border border-edge px-2.5 py-1 text-xs text-mute hover:text-text">
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm text-text">{t.name}</span>
                  <span className="font-mono text-xs text-mute">{t.count}</span>
                  <button onClick={() => startRename(t)} className="rounded-lg border border-edge px-2.5 py-1 text-xs text-mute hover:text-text">
                    Rename
                  </button>
                  <button
                    onClick={() => deleteTopic(t.name)}
                    disabled={busyName === t.name}
                    title={t.count > 0 ? `In use by ${t.count} question(s) — reassign them first` : "Delete"}
                    className="rounded-lg border border-edge px-2.5 py-1 text-xs text-mute hover:text-devops disabled:opacity-50"
                  >
                    {busyName === t.name ? "…" : "Delete"}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {orphans.length > 0 && (
        <div className="mt-4 rounded-xl border border-devops/40 bg-devops/10 px-3 py-2 text-sm text-devops">
          <div className="mb-1 font-medium">
            {orphans.length} topic value{orphans.length > 1 ? "s" : ""} on questions that aren't in the list above:
          </div>
          <ul className="list-inside list-disc">
            {orphans.map(o => <li key={o.name}>{o.name} ({o.count})</li>)}
          </ul>
          <div className="mt-1 text-xs opacity-80">
            These questions have a topic_ai value that doesn't match any canonical topic — usually leftover from
            before a rename. Add it back above (it'll immediately show questions again) or reassign those
            questions via "Fix a question's topic".
          </div>
        </div>
      )}
    </div>
  );
}

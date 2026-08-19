"use client";
import { useEffect, useState } from "react";

type Learner = { email: string; synced_at: string; added_by: string | null };

export default function LearnerAccessManager() {
  const [learners, setLearners] = useState<Learner[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch("/api/admin/allowed-learners");
    const j = await res.json().catch(() => ({ ok: false }));
    if (j.ok) { setLearners(j.learners); setError(null); }
    else setError(res.status === 403 ? "Not authorized." : "Couldn't load access list.");
    setLoaded(true);
  };
  useEffect(() => { load(); }, []);

  const addLearner = async () => {
    if (!newEmail.includes("@")) { setAddError("Enter a valid email."); return; }
    setAdding(true);
    setAddError(null);
    const res = await fetch("/api/admin/allowed-learners", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: newEmail }),
    });
    const j = await res.json().catch(() => ({ ok: false }));
    if (j.ok) { setNewEmail(""); await load(); }
    else setAddError(j.error || "Couldn't grant access.");
    setAdding(false);
  };

  const removeLearner = async (email: string) => {
    if (!confirm(`Remove ${email}'s access? If they're still on the tracking sheet, the next sync will re-add them.`)) return;
    await fetch("/api/admin/allowed-learners", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, action: "remove" }),
    });
    setLearners(l => l.filter(x => x.email !== email));
  };

  if (!loaded) return null;

  const filtered = query.trim()
    ? learners.filter(l => l.email.toLowerCase().includes(query.trim().toLowerCase()))
    : learners;

  return (
    <div className="rounded-2xl border border-edge bg-panel p-5 shadow-card">
      <div className="mb-1 font-mono text-[11px] uppercase tracking-widest text-mute">Learner access</div>
      <p className="mb-4 text-sm text-mute">
        Any @scaler.com email can always sign in. Everyone else needs to be here (or in Admins) —
        most are synced nightly from the tracking sheet. Grant access to someone not yet on that
        sheet here; it survives future syncs.
      </p>

      {error && (
        <div className="mb-4 rounded-xl border border-devops/40 bg-devops/10 px-3 py-2 text-sm text-devops">{error}</div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={newEmail}
          onChange={e => setNewEmail(e.target.value)}
          placeholder="learner.email@example.com"
          className="min-w-[220px] flex-1 rounded-xl border border-edge bg-panel2 px-3 py-2 text-sm"
        />
        <button onClick={addLearner} disabled={adding} className="rounded-xl bg-text px-4 py-2 text-sm font-medium text-ink disabled:opacity-50">
          {adding ? "Granting…" : "Grant access"}
        </button>
      </div>
      {addError && (
        <div className="mb-4 rounded-xl border border-devops/40 bg-devops/10 px-3 py-2 text-sm text-devops">{addError}</div>
      )}

      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="filter by email..."
        className="mb-3 w-full rounded-xl border border-edge bg-panel2 px-3 py-2 text-sm text-text placeholder:text-mute/60 focus:border-acad focus:outline-none"
      />

      <div className="max-h-[360px] overflow-y-auto divide-y divide-edge/60">
        {filtered.length === 0 && <div className="py-4 text-sm text-mute">No learners found.</div>}
        {filtered.map(l => (
          <div key={l.email} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <div>
              <div>{l.email}</div>
              <div className="font-mono text-[11px] text-mute">
                {l.added_by ? `granted by ${l.added_by}` : "from tracking sheet"} · {new Date(l.synced_at).toLocaleDateString()}
              </div>
            </div>
            <button onClick={() => removeLearner(l.email)} className="shrink-0 rounded-lg border border-edge px-2.5 py-1 text-sm text-mute hover:text-text">
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

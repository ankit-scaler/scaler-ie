"use client";
import { useEffect, useMemo, useState } from "react";

type Assignment = { id: number; program: string | null; company: string; role: string; round: string | null; link: string | null };
type Draft = { program: string; company: string; role: string; round: string; link: string };

const emptyDraft: Draft = { program: "", company: "", role: "", round: "", link: "" };
const toDraft = (a: Assignment): Draft => ({ program: a.program || "", company: a.company, role: a.role, round: a.round || "", link: a.link || "" });

export default function AssignmentsManager() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [newDraft, setNewDraft] = useState<Draft>(emptyDraft);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch("/api/admin/assignments");
    const j = await res.json().catch(() => ({ ok: false }));
    if (j.ok) { setAssignments(j.assignments); setError(null); }
    else setError(res.status === 403 ? "Not authorized." : "Couldn't load assignments.");
    setLoaded(true);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const qL = query.trim().toLowerCase();
    if (!qL) return assignments;
    return assignments.filter(a =>
      (a.program || "").toLowerCase().includes(qL) ||
      a.company.toLowerCase().includes(qL) ||
      a.role.toLowerCase().includes(qL) ||
      (a.round || "").toLowerCase().includes(qL)
    );
  }, [assignments, query]);

  const startEdit = (a: Assignment) => { setEditingId(a.id); setEditDraft(toDraft(a)); };
  const cancelEdit = () => { setEditingId(null); setEditDraft(emptyDraft); };

  const saveEdit = async (id: number) => {
    if (!editDraft.company.trim() || !editDraft.role.trim()) return;
    setSaving(true);
    const res = await fetch("/api/admin/assignments", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "update", id, ...editDraft }),
    });
    const j = await res.json().catch(() => ({ ok: false }));
    setSaving(false);
    if (j.ok) { setEditingId(null); await load(); }
  };

  const addAssignment = async () => {
    if (!newDraft.company.trim() || !newDraft.role.trim()) {
      setAddError("Company and Role are required.");
      return;
    }
    setAdding(true);
    setAddError(null);
    const res = await fetch("/api/admin/assignments", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "create", ...newDraft }),
    });
    const j = await res.json().catch(() => ({ ok: false }));
    if (j.ok) { setNewDraft(emptyDraft); await load(); }
    else setAddError(j.error || "Couldn't add assignment.");
    setAdding(false);
  };

  const removeAssignment = async (id: number) => {
    if (!confirm("Remove this assignment?")) return;
    await fetch("/api/admin/assignments", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    setAssignments(a => a.filter(x => x.id !== id));
  };

  if (!loaded) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-edge bg-panel p-5 shadow-card">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-dsml" />
      <div className="mb-1 font-mono text-xs font-bold uppercase tracking-widest text-dsml">Manage assignments</div>
      <p className="mb-4 text-sm text-mute">Add or edit assignments manually — these appear on the Assignments page immediately.</p>

      {error && (
        <div className="mb-4 rounded-xl border border-devops/40 bg-devops/10 px-3 py-2 text-sm text-devops">{error}</div>
      )}

      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="filter by company, role, program, or round..."
        className="mb-4 w-full rounded-xl border border-edge bg-panel2 px-3 py-2 text-sm text-text placeholder:text-mute/60 focus:border-acad focus:outline-none"
      />

      <div className="max-h-[420px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-panel text-left font-mono text-[11px] uppercase tracking-widest text-mute">
            <tr>
              <th className="py-2">Program</th>
              <th className="py-2">Company</th>
              <th className="py-2">Role</th>
              <th className="py-2">Round</th>
              <th className="py-2">Link</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge/60">
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="py-4 text-mute">No assignments found.</td></tr>
            )}
            {filtered.map(a => {
              const isEditing = editingId === a.id;
              return isEditing ? (
                <tr key={a.id}>
                  <td className="py-2 pr-2">
                    <input value={editDraft.program} onChange={e => setEditDraft(d => ({ ...d, program: e.target.value }))} placeholder="Program" className="w-full rounded-lg border border-edge bg-panel2 px-2 py-1 text-sm" />
                  </td>
                  <td className="py-2 pr-2">
                    <input value={editDraft.company} onChange={e => setEditDraft(d => ({ ...d, company: e.target.value }))} placeholder="Company" className="w-full rounded-lg border border-edge bg-panel2 px-2 py-1 text-sm" />
                  </td>
                  <td className="py-2 pr-2">
                    <input value={editDraft.role} onChange={e => setEditDraft(d => ({ ...d, role: e.target.value }))} placeholder="Role" className="w-full rounded-lg border border-edge bg-panel2 px-2 py-1 text-sm" />
                  </td>
                  <td className="py-2 pr-2">
                    <input value={editDraft.round} onChange={e => setEditDraft(d => ({ ...d, round: e.target.value }))} placeholder="Round" className="w-full rounded-lg border border-edge bg-panel2 px-2 py-1 text-sm" />
                  </td>
                  <td className="py-2 pr-2">
                    <input value={editDraft.link} onChange={e => setEditDraft(d => ({ ...d, link: e.target.value }))} placeholder="https://..." className="w-full rounded-lg border border-edge bg-panel2 px-2 py-1 text-sm" />
                  </td>
                  <td className="py-2 whitespace-nowrap">
                    <button onClick={() => saveEdit(a.id)} disabled={saving} className="mr-1.5 rounded-lg border border-edge px-2.5 py-1 text-xs text-mute hover:text-text disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
                    <button onClick={cancelEdit} className="rounded-lg border border-edge px-2.5 py-1 text-xs text-mute hover:text-text">Cancel</button>
                  </td>
                </tr>
              ) : (
                <tr key={a.id}>
                  <td className="py-2 font-mono text-xs text-mute">{a.program || "—"}</td>
                  <td className="py-2">{a.company}</td>
                  <td className="py-2 text-mute">{a.role}</td>
                  <td className="py-2 text-mute">{a.round || "—"}</td>
                  <td className="max-w-[220px] truncate py-2 text-xs text-mute">{a.link || "—"}</td>
                  <td className="py-2 whitespace-nowrap">
                    <button onClick={() => startEdit(a)} className="mr-1.5 rounded-lg border border-edge px-2.5 py-1 text-xs text-mute hover:text-text">Edit</button>
                    <button onClick={() => removeAssignment(a.id)} className="rounded-lg border border-edge px-2.5 py-1 text-xs text-mute hover:text-devops">Remove</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-5 border-t border-edge/60 pt-5">
        <div className="mb-1 text-sm font-medium">Add a new assignment</div>
        {addError && (
          <div className="mb-3 rounded-xl border border-devops/40 bg-devops/10 px-3 py-2 text-sm text-devops">{addError}</div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input value={newDraft.program} onChange={e => setNewDraft(d => ({ ...d, program: e.target.value }))} placeholder="Program" className="min-w-[140px] flex-1 basis-[140px] rounded-lg border border-edge bg-panel2 px-2.5 py-1.5 text-sm text-text placeholder:text-mute/60 focus:border-acad focus:outline-none" />
          <input value={newDraft.company} onChange={e => setNewDraft(d => ({ ...d, company: e.target.value }))} placeholder="Company" className="min-w-[160px] flex-1 basis-[160px] rounded-lg border border-edge bg-panel2 px-2.5 py-1.5 text-sm text-text placeholder:text-mute/60 focus:border-acad focus:outline-none" />
          <input value={newDraft.role} onChange={e => setNewDraft(d => ({ ...d, role: e.target.value }))} placeholder="Role" className="min-w-[160px] flex-1 basis-[160px] rounded-lg border border-edge bg-panel2 px-2.5 py-1.5 text-sm text-text placeholder:text-mute/60 focus:border-acad focus:outline-none" />
          <input value={newDraft.round} onChange={e => setNewDraft(d => ({ ...d, round: e.target.value }))} placeholder="Round" className="min-w-[120px] flex-1 basis-[120px] rounded-lg border border-edge bg-panel2 px-2.5 py-1.5 text-sm text-text placeholder:text-mute/60 focus:border-acad focus:outline-none" />
          <input value={newDraft.link} onChange={e => setNewDraft(d => ({ ...d, link: e.target.value }))} placeholder="https://... (optional, add later)" className="min-w-[220px] flex-[2] rounded-lg border border-edge bg-panel2 px-2.5 py-1.5 text-sm text-text placeholder:text-mute/60 focus:border-acad focus:outline-none" />
          <button onClick={addAssignment} disabled={adding} className="rounded-lg bg-text px-3.5 py-1.5 text-sm font-medium text-ink transition hover:opacity-90 disabled:opacity-50">{adding ? "Adding…" : "Add assignment"}</button>
        </div>
      </div>
    </div>
  );
}

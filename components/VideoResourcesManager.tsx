"use client";
import { useEffect, useMemo, useState } from "react";

type Packet = { id: number; role: string; yoe: string };
type Resource = { id: number; packet_id: number; topic: string; video_link: string | null; sort_order: number };

export default function VideoResourcesManager() {
  const [packets, setPackets] = useState<Packet[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState({ topic: "", video_link: "" });
  const [saving, setSaving] = useState(false);

  const [newPacketId, setNewPacketId] = useState<string>("");
  const [newTopic, setNewTopic] = useState("");
  const [newLink, setNewLink] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch("/api/admin/video-resources");
    const j = await res.json().catch(() => ({ ok: false }));
    if (j.ok) {
      setPackets(j.packets);
      setResources(j.resources);
      setError(null);
      if (!newPacketId && j.packets.length) setNewPacketId(String(j.packets[0].id));
    } else setError(res.status === 403 ? "Not authorized." : "Couldn't load video resources.");
    setLoaded(true);
  };
  useEffect(() => { load(); }, []);

  const packetLabel = (packet_id: number) => {
    const p = packets.find(x => x.id === packet_id);
    return p ? `${p.role} · ${p.yoe}` : "—";
  };

  const filtered = useMemo(() => {
    const qL = query.trim().toLowerCase();
    if (!qL) return resources;
    return resources.filter(r =>
      r.topic.toLowerCase().includes(qL) || packetLabel(r.packet_id).toLowerCase().includes(qL)
    );
  }, [resources, query, packets]);

  const startEdit = (r: Resource) => { setEditingId(r.id); setEditDraft({ topic: r.topic, video_link: r.video_link || "" }); };
  const cancelEdit = () => { setEditingId(null); setEditDraft({ topic: "", video_link: "" }); };

  const saveEdit = async (id: number) => {
    if (!editDraft.topic.trim()) return;
    setSaving(true);
    const res = await fetch("/api/admin/video-resources", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "update", id, ...editDraft }),
    });
    const j = await res.json().catch(() => ({ ok: false }));
    setSaving(false);
    if (j.ok) { setEditingId(null); await load(); }
  };

  const addResource = async () => {
    if (!newPacketId || !newTopic.trim()) {
      setAddError("Pick a packet and enter a topic.");
      return;
    }
    setAdding(true);
    setAddError(null);
    const res = await fetch("/api/admin/video-resources", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "create", packet_id: Number(newPacketId), topic: newTopic, video_link: newLink }),
    });
    const j = await res.json().catch(() => ({ ok: false }));
    if (j.ok) { setNewTopic(""); setNewLink(""); await load(); }
    else setAddError(j.error || "Couldn't add resource.");
    setAdding(false);
  };

  const removeResource = async (id: number) => {
    if (!confirm("Remove this video resource?")) return;
    await fetch("/api/admin/video-resources", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    setResources(r => r.filter(x => x.id !== id));
  };

  if (!loaded) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-edge bg-panel p-5 shadow-card">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-devops" />
      <div className="mb-1 font-mono text-xs font-bold uppercase tracking-widest text-devops">Manage video resources</div>
      <p className="mb-4 text-sm text-mute">
        Topic recordings shown under "Learning Resources" for each packet — add, edit, or remove them here.
      </p>

      {error && (
        <div className="mb-4 rounded-xl border border-devops/40 bg-devops/10 px-3 py-2 text-sm text-devops">{error}</div>
      )}
      {!error && packets.length === 0 && (
        <div className="mb-4 rounded-xl border border-edge/60 bg-panel2 px-3 py-2 text-sm text-mute">
          No packets found yet — add one in "Manage packet links" below first.
        </div>
      )}

      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="filter by topic or packet..."
        className="mb-4 w-full rounded-xl border border-edge bg-panel2 px-3 py-2 text-sm text-text placeholder:text-mute/60 focus:border-acad focus:outline-none"
      />

      <div className="max-h-[420px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-panel text-left font-mono text-[11px] uppercase tracking-widest text-mute">
            <tr>
              <th className="py-2">Packet</th>
              <th className="py-2">Topic</th>
              <th className="py-2">Video link</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge/60">
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="py-4 text-mute">No video resources found.</td></tr>
            )}
            {filtered.map(r => {
              const isEditing = editingId === r.id;
              return isEditing ? (
                <tr key={r.id}>
                  <td className="py-2 pr-2 text-xs text-mute">{packetLabel(r.packet_id)}</td>
                  <td className="py-2 pr-2">
                    <input value={editDraft.topic} onChange={e => setEditDraft(d => ({ ...d, topic: e.target.value }))} className="w-full rounded-lg border border-edge bg-panel2 px-2 py-1 text-sm" />
                  </td>
                  <td className="py-2 pr-2">
                    <input value={editDraft.video_link} onChange={e => setEditDraft(d => ({ ...d, video_link: e.target.value }))} placeholder="https://..." className="w-full rounded-lg border border-edge bg-panel2 px-2 py-1 text-sm" />
                  </td>
                  <td className="py-2 whitespace-nowrap">
                    <button onClick={() => saveEdit(r.id)} disabled={saving} className="mr-1.5 rounded-lg border border-edge px-2.5 py-1 text-xs text-mute hover:text-text disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
                    <button onClick={cancelEdit} className="rounded-lg border border-edge px-2.5 py-1 text-xs text-mute hover:text-text">Cancel</button>
                  </td>
                </tr>
              ) : (
                <tr key={r.id}>
                  <td className="py-2 font-mono text-xs text-mute">{packetLabel(r.packet_id)}</td>
                  <td className="py-2">{r.topic}</td>
                  <td className="max-w-[220px] truncate py-2 text-xs text-mute">{r.video_link || "—"}</td>
                  <td className="py-2 whitespace-nowrap">
                    <button onClick={() => startEdit(r)} className="mr-1.5 rounded-lg border border-edge px-2.5 py-1 text-xs text-mute hover:text-text">Edit</button>
                    <button onClick={() => removeResource(r.id)} className="rounded-lg border border-edge px-2.5 py-1 text-xs text-mute hover:text-devops">Remove</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-5 border-t border-edge/60 pt-5">
        <div className="mb-1 text-sm font-medium">Add a new video resource</div>
        {addError && (
          <div className="mb-3 rounded-xl border border-devops/40 bg-devops/10 px-3 py-2 text-sm text-devops">{addError}</div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={newPacketId}
            onChange={e => setNewPacketId(e.target.value)}
            className="min-w-[180px] flex-1 basis-[200px] rounded-lg border border-edge bg-panel2 px-2.5 py-1.5 text-sm text-text focus:border-acad focus:outline-none"
          >
            {packets.map(p => <option key={p.id} value={p.id}>{p.role} · {p.yoe}</option>)}
          </select>
          <input
            value={newTopic}
            onChange={e => setNewTopic(e.target.value)}
            placeholder="Topic (e.g. Graph Interview Problems)"
            className="min-w-[200px] flex-1 basis-[220px] rounded-lg border border-edge bg-panel2 px-2.5 py-1.5 text-sm text-text placeholder:text-mute/60 focus:border-acad focus:outline-none"
          />
          <input
            value={newLink}
            onChange={e => setNewLink(e.target.value)}
            placeholder="https://... (optional, add later)"
            className="min-w-[220px] flex-[2] rounded-lg border border-edge bg-panel2 px-2.5 py-1.5 text-sm text-text placeholder:text-mute/60 focus:border-acad focus:outline-none"
          />
          <button
            onClick={addResource}
            disabled={adding || packets.length === 0}
            className="rounded-lg bg-text px-3.5 py-1.5 text-sm font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
          >{adding ? "Adding…" : "Add resource"}</button>
        </div>
      </div>
    </div>
  );
}

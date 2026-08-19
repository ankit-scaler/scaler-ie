"use client";
import { useEffect, useState } from "react";

type Packet = {
  id: number; role: string; yoe: string; doc_title: string | null; doc_link: string | null;
  sort_order: number; content_synced_at: string | null;
};

const emptyDraft = { role: "", yoe: "", doc_title: "", doc_link: "" };

export default function PacketLinksManager() {
  const [packets, setPackets] = useState<Packet[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowNotice, setRowNotice] = useState<Record<number, string>>({});
  const [newPacket, setNewPacket] = useState(emptyDraft);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch("/api/admin/packets");
    const j = await res.json().catch(() => ({ ok: false }));
    if (j.ok) { setPackets(j.packets); setError(null); }
    else setError(res.status === 403 ? "Not authorized." : "Couldn't load packets.");
    setLoaded(true);
  };
  useEffect(() => { load(); }, []);

  const save = async (id: number, key: string) => {
    const value = draft[key] ?? "";
    setSavingKey(key);
    setRowNotice(n => ({ ...n, [id]: "" }));
    const res = await fetch("/api/admin/packets", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, value }),
    });
    const j = await res.json().catch(() => ({ ok: false }));
    if (j.warning) setRowNotice(n => ({ ...n, [id]: j.warning }));
    await load();
    setSavingKey(null);
  };

  const refresh = async (id: number) => {
    setRefreshingId(id);
    setRowNotice(n => ({ ...n, [id]: "" }));
    const res = await fetch("/api/admin/packets", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "refresh", id }),
    });
    const j = await res.json().catch(() => ({ ok: false }));
    if (!j.ok) setRowNotice(n => ({ ...n, [id]: j.error || "Refresh failed." }));
    await load();
    setRefreshingId(null);
  };

  const addPacket = async () => {
    if (!newPacket.role.trim() || !newPacket.yoe.trim()) {
      setAddError("Role and YoE are required.");
      return;
    }
    setAdding(true);
    setAddError(null);
    const res = await fetch("/api/admin/packets", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "create", ...newPacket }),
    });
    const j = await res.json().catch(() => ({ ok: false }));
    if (j.ok) { setNewPacket(emptyDraft); await load(); }
    else setAddError(j.error || "Couldn't add packet.");
    setAdding(false);
  };

  const removePacket = async (id: number) => {
    if (!confirm("Remove this packet? This also deletes its read history.")) return;
    await fetch("/api/admin/packets", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    setPackets(p => p.filter(x => x.id !== id));
  };

  if (!loaded) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-edge bg-panel p-5 shadow-card">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-aiml" />
      <div className="mb-1 font-mono text-xs font-bold uppercase tracking-widest text-aiml">Manage packet links</div>
      <p className="mb-4 text-sm text-mute">
        Paste the real doc URL for each row below. Content is pulled in from the doc and rendered on the Packets
        page itself — use Refresh after editing the source doc to pick up changes.
      </p>

      {error && (
        <div className="mb-4 rounded-xl border border-devops/40 bg-devops/10 px-3 py-2 text-sm text-devops">{error}</div>
      )}
      {!error && packets.length === 0 && (
        <div className="mb-4 rounded-xl border border-edge/60 bg-panel2 px-3 py-2 text-sm text-mute">
          No packets found. Run <code className="font-mono text-text">supabase/schema.sql</code> then{" "}
          <code className="font-mono text-text">supabase/seed_packets.sql</code> in the Supabase SQL editor, then reload this page.
        </div>
      )}

      <div className="space-y-2">
        {packets.map(p => {
          const key = `p-${p.id}`;
          const val = draft[key] ?? p.doc_link ?? "";
          const notice = rowNotice[p.id];
          return (
            <div key={p.id} className="rounded-xl border border-edge/60 bg-panel2 p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-[180px] flex-1 basis-[220px]">
                  <div className="text-sm">{p.role} <span className="text-mute">· {p.yoe}</span></div>
                  {p.doc_title && <div className="font-mono text-[11px] text-mute">{p.doc_title}</div>}
                  <div className="font-mono text-[11px] text-mute">
                    {p.content_synced_at ? `Content synced ${new Date(p.content_synced_at).toLocaleString()}` : "Content not synced yet"}
                  </div>
                </div>
                <input
                  value={val}
                  onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
                  placeholder="https://docs.google.com/..."
                  className="min-w-[220px] flex-[2] rounded-lg border border-edge bg-panel px-2.5 py-1.5 text-sm text-text placeholder:text-mute/60 focus:border-acad focus:outline-none"
                />
                <button
                  onClick={() => save(p.id, key)}
                  disabled={savingKey === key}
                  className="rounded-lg border border-edge px-3 py-1.5 text-sm text-mute hover:text-text disabled:opacity-50"
                >{savingKey === key ? "Saving…" : "Save"}</button>
                <button
                  onClick={() => refresh(p.id)}
                  disabled={!p.doc_link || refreshingId === p.id}
                  className="rounded-lg border border-edge px-3 py-1.5 text-sm text-mute hover:text-text disabled:opacity-50"
                >{refreshingId === p.id ? "Refreshing…" : "Refresh content"}</button>
                <button
                  onClick={() => removePacket(p.id)}
                  className="rounded-lg border border-edge px-3 py-1.5 text-sm text-mute hover:text-devops"
                >Remove</button>
              </div>
              {notice && (
                <div className="mt-2 rounded-lg border border-devops/40 bg-devops/10 px-2.5 py-1.5 text-xs text-devops">{notice}</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 border-t border-edge/60 pt-5">
        <div className="mb-1 text-sm font-medium">Add a new packet</div>
        <p className="mb-3 text-sm text-mute">Creates a new Role × YoE packet that appears on the Packets page immediately — no SQL needed.</p>
        {addError && (
          <div className="mb-3 rounded-xl border border-devops/40 bg-devops/10 px-3 py-2 text-sm text-devops">{addError}</div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={newPacket.role}
            onChange={e => setNewPacket(d => ({ ...d, role: e.target.value }))}
            placeholder="Role (e.g. Backend Engineer)"
            className="min-w-[180px] flex-1 basis-[200px] rounded-lg border border-edge bg-panel2 px-2.5 py-1.5 text-sm text-text placeholder:text-mute/60 focus:border-acad focus:outline-none"
          />
          <input
            value={newPacket.yoe}
            onChange={e => setNewPacket(d => ({ ...d, yoe: e.target.value }))}
            placeholder="YoE (e.g. 2–5 yrs)"
            className="min-w-[140px] flex-1 basis-[140px] rounded-lg border border-edge bg-panel2 px-2.5 py-1.5 text-sm text-text placeholder:text-mute/60 focus:border-acad focus:outline-none"
          />
          <input
            value={newPacket.doc_title}
            onChange={e => setNewPacket(d => ({ ...d, doc_title: e.target.value }))}
            placeholder="Doc title (optional)"
            className="min-w-[180px] flex-1 basis-[200px] rounded-lg border border-edge bg-panel2 px-2.5 py-1.5 text-sm text-text placeholder:text-mute/60 focus:border-acad focus:outline-none"
          />
          <input
            value={newPacket.doc_link}
            onChange={e => setNewPacket(d => ({ ...d, doc_link: e.target.value }))}
            placeholder="https://docs.google.com/... (optional, add later)"
            className="min-w-[220px] flex-[2] rounded-lg border border-edge bg-panel2 px-2.5 py-1.5 text-sm text-text placeholder:text-mute/60 focus:border-acad focus:outline-none"
          />
          <button
            onClick={addPacket}
            disabled={adding}
            className="rounded-lg bg-text px-3.5 py-1.5 text-sm font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
          >{adding ? "Adding…" : "Add packet"}</button>
        </div>
      </div>
    </div>
  );
}

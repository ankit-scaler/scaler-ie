"use client";
import { useEffect, useState } from "react";

type Packet = { id: number; role: string; yoe: string; doc_title: string | null; doc_link: string | null; sort_order: number };

export default function PacketLinksManager() {
  const [packets, setPackets] = useState<Packet[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    await fetch("/api/admin/packets", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, value }),
    });
    setPackets(p => p.map(x => x.id === id ? { ...x, doc_link: value || null } : x));
    setSavingKey(null);
  };

  if (!loaded) return null;

  return (
    <div className="rounded-2xl border border-edge bg-panel p-5 shadow-card">
      <div className="mb-1 font-mono text-[11px] uppercase tracking-widest text-mute">Manage packet links</div>
      <p className="mb-4 text-sm text-mute">
        Paste the real doc URL for each row below — these go live on the Packets page immediately.
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
          return (
            <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-edge/60 bg-panel2 p-2.5">
              <div className="min-w-[180px] flex-1 basis-[220px]">
                <div className="text-sm">{p.role} <span className="text-mute">· {p.yoe}</span></div>
                {p.doc_title && <div className="font-mono text-[11px] text-mute">{p.doc_title}</div>}
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
            </div>
          );
        })}
      </div>
    </div>
  );
}

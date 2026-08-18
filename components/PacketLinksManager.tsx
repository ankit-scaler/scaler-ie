"use client";
import { useEffect, useState } from "react";

type Packet = { id: number; role: string; yoe: string; doc_title: string | null; doc_link: string | null; sort_order: number };
type Session = { id: number; title: string; url: string | null };

export default function PacketLinksManager() {
  const [packets, setPackets] = useState<Packet[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    const res = await fetch("/api/admin/packets");
    const j = await res.json();
    if (j.ok) { setPackets(j.packets); setSessions(j.sessions); }
    setLoaded(true);
  };
  useEffect(() => { load(); }, []);

  const save = async (type: "packet" | "session", id: number, key: string) => {
    const value = draft[key] ?? "";
    setSavingKey(key);
    await fetch("/api/admin/packets", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, id, value }),
    });
    if (type === "packet") setPackets(p => p.map(x => x.id === id ? { ...x, doc_link: value || null } : x));
    else setSessions(s => s.map(x => x.id === id ? { ...x, url: value || null } : x));
    setSavingKey(null);
  };

  if (!loaded) return null;

  return (
    <div className="rounded-2xl border border-edge bg-panel p-5 shadow-card">
      <div className="mb-1 font-mono text-[11px] uppercase tracking-widest text-mute">Manage packet links</div>
      <p className="mb-4 text-sm text-mute">
        Paste the real doc / recording URL for each row below — these go live on the Packets page immediately.
      </p>

      <div className="mb-6">
        <div className="mb-2 font-mono text-[11px] uppercase tracking-widest text-mute">Packet docs</div>
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
                  onClick={() => save("packet", p.id, key)}
                  disabled={savingKey === key}
                  className="rounded-lg border border-edge px-3 py-1.5 text-sm text-mute hover:text-text disabled:opacity-50"
                >{savingKey === key ? "Saving…" : "Save"}</button>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 font-mono text-[11px] uppercase tracking-widest text-mute">Session recordings</div>
        <div className="space-y-2">
          {sessions.map(s => {
            const key = `s-${s.id}`;
            const val = draft[key] ?? s.url ?? "";
            return (
              <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-edge/60 bg-panel2 p-2.5">
                <div className="min-w-[180px] flex-1 basis-[220px] text-sm">{s.title}</div>
                <input
                  value={val}
                  onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
                  placeholder="https://..."
                  className="min-w-[220px] flex-[2] rounded-lg border border-edge bg-panel px-2.5 py-1.5 text-sm text-text placeholder:text-mute/60 focus:border-acad focus:outline-none"
                />
                <button
                  onClick={() => save("session", s.id, key)}
                  disabled={savingKey === key}
                  className="rounded-lg border border-edge px-3 py-1.5 text-sm text-mute hover:text-text disabled:opacity-50"
                >{savingKey === key ? "Saving…" : "Save"}</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

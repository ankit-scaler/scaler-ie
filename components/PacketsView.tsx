"use client";
import { useMemo, useState } from "react";
import Link from "next/link";

type Packet = { id: number; role: string; yoe: string; doc_link: string | null; sort_order: number; content_synced_at: string | null };

export default function PacketsView({ packets }: { packets: Packet[] }) {
  const roles = useMemo(() => ["All", ...Array.from(new Set(packets.map(p => p.role)))], [packets]);
  const [role, setRole] = useState("All");
  const filtered = role === "All" ? packets : packets.filter(p => p.role === role);

  return (
    <div className="space-y-8">
      <section>
        <span className="font-mono text-[11px] uppercase tracking-widest text-mute">Packets for Hirings</span>
        <h1 className="mt-1 font-display text-4xl leading-tight sm:text-5xl">
          Prep packets,<br /><span className="text-mute">by role and experience.</span>
        </h1>
      </section>

      <div className="flex flex-wrap gap-1.5">
        {roles.map(r => (
          <button
            key={r}
            onClick={() => setRole(r)}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition ${
              role === r ? "border-text bg-text text-ink" : "border-edge text-mute hover:border-text/40 hover:text-text"
            }`}
          >{r}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-edge bg-panel p-10 text-center text-mute">
          Nothing here yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(p => <PacketCard key={p.id} packet={p} />)}
        </div>
      )}
    </div>
  );
}

function PacketCard({ packet }: { packet: Packet }) {
  const hasDoc = packet.content_synced_at || (packet.doc_link && /^https?:\/\//i.test(packet.doc_link));
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-edge bg-panel p-5 shadow-card transition-shadow hover:shadow-cardH">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-acad/60 to-transparent" />
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-edge bg-panel2 px-2.5 py-0.5 font-mono">{packet.role}</span>
        <span className="rounded-full border border-edge bg-panel2 px-2.5 py-0.5 font-mono text-mute">{packet.yoe}</span>
      </div>
      <div className="mb-4 font-display text-lg leading-snug">{packet.role} — {packet.yoe}</div>

      {hasDoc ? (
        <Link
          href={`/packets/${packet.id}`}
          className="inline-flex items-center gap-2 rounded-xl border border-edge bg-panel2 px-3.5 py-2 text-sm text-text transition hover:border-text/40"
        >
          {packet.content_synced_at ? "Read packet" : "Open packet"}
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M7 3h10v10h-2V6.4L4.7 16.7 3.3 15.3 13.6 5H7V3z"/></svg>
        </Link>
      ) : (
        <span className="inline-flex items-center gap-2 rounded-xl border border-edge/60 bg-panel2/50 px-3.5 py-2 text-sm text-mute">
          Coming soon
        </span>
      )}
    </article>
  );
}

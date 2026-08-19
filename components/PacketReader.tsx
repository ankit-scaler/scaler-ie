"use client";
import { useEffect } from "react";
import Link from "next/link";

type Packet = {
  id: number; role: string; yoe: string; doc_title: string | null;
  doc_link: string | null; content_html: string | null; content_synced_at: string | null;
};

export default function PacketReader({ packet }: { packet: Packet }) {
  useEffect(() => {
    fetch("/api/track-packet", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ packet_id: packet.id }),
    }).catch(() => {});
  }, [packet.id]);

  const hasExternalLink = packet.doc_link && /^https?:\/\//i.test(packet.doc_link);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/packets" className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-text">
        ← Back to packets
      </Link>

      <section>
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-edge bg-panel2 px-2.5 py-0.5 font-mono">{packet.role}</span>
          <span className="rounded-full border border-edge bg-panel2 px-2.5 py-0.5 font-mono text-mute">{packet.yoe}</span>
        </div>
        <h1 className="font-display text-3xl leading-tight sm:text-4xl">{packet.role} — {packet.yoe}</h1>
      </section>

      {packet.content_html ? (
        <article
          className="doc-content rounded-2xl border border-edge bg-panel p-6 shadow-card sm:p-8"
          dangerouslySetInnerHTML={{ __html: packet.content_html }}
        />
      ) : hasExternalLink ? (
        <div className="rounded-2xl border border-edge bg-panel p-6 text-sm text-mute shadow-card">
          This packet hasn&apos;t been synced for on-site reading yet.{" "}
          <a href={packet.doc_link!} target="_blank" rel="noreferrer" className="text-acad underline underline-offset-2">
            Open the source doc instead
          </a>.
        </div>
      ) : (
        <div className="rounded-2xl border border-edge/60 bg-panel2/50 p-10 text-center text-mute">
          Coming soon.
        </div>
      )}
    </div>
  );
}

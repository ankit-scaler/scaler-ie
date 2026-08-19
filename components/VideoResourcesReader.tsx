"use client";
import Link from "next/link";

type Packet = { id: number; role: string; yoe: string };
type Resource = { id: number; topic: string; video_link: string | null };

export default function VideoResourcesReader({ packet, resources }: { packet: Packet; resources: Resource[] }) {
  const trackWatch = (id: number) =>
    fetch("/api/track-video", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ video_resource_id: id }) }).catch(() => {});

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
        <h1 className="font-display text-3xl leading-tight sm:text-4xl">Learning Resources</h1>
      </section>

      {resources.length === 0 ? (
        <div className="rounded-2xl border border-edge/60 bg-panel2/50 p-10 text-center text-mute">
          Coming soon.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-edge bg-panel shadow-card">
          <div className="grid grid-cols-[1fr_auto] gap-4 border-b border-edge/60 bg-panel2 px-5 py-3 font-mono text-[11px] uppercase tracking-widest text-mute">
            <span>Topic</span>
            <span>Watch tutorial</span>
          </div>
          <div className="divide-y divide-edge/60">
            {resources.map(r => {
              const hasLink = r.video_link && /^https?:\/\//i.test(r.video_link);
              return (
                <div key={r.id} className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4">
                  <span className="text-sm">{r.topic}</span>
                  {hasLink ? (
                    <a
                      href={r.video_link!}
                      target="_blank" rel="noreferrer"
                      onClick={() => trackWatch(r.id)}
                      className="inline-flex items-center gap-2 rounded-xl border border-edge bg-panel2 px-3.5 py-1.5 text-sm text-text transition hover:border-text/40"
                    >
                      Watch tutorial
                      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M7 3h10v10h-2V6.4L4.7 16.7 3.3 15.3 13.6 5H7V3z"/></svg>
                    </a>
                  ) : (
                    <span className="inline-flex items-center rounded-xl border border-edge/60 bg-panel2/50 px-3.5 py-1.5 text-sm text-mute">
                      Coming soon
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

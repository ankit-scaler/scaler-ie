import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { getPacketDetail, TRACK_LABELS, YOE_LABELS } from "@/lib/packets-db";

export const dynamic = "force-dynamic";

const PROBLEM_SOURCE_LABELS: Record<string, string> = { LEETCODE: "LeetCode", GFG: "GeeksforGeeks", MANUAL: "Problem link" };

export default async function CompanyPacketDetailPage({ params }: { params: { slug: string } }) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const packet = await getPacketDetail(params.slug);
  if (!packet) notFound();

  return (
    <div className="space-y-8">
      <section>
        <Link href="/company-packets" className="font-mono text-[11px] uppercase tracking-widest text-mute hover:text-text">← Packets</Link>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-acad/30 bg-acad/10 px-3 py-1 font-medium text-acad">{TRACK_LABELS[packet.track]}</span>
          <span className="rounded-full border border-edge-strong px-3 py-1 text-mute">{YOE_LABELS[packet.yoeBucket]}</span>
        </div>
        <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">{packet.company}</h1>
        <p className="mt-1 text-lg text-mute">{packet.role}</p>
      </section>

      {packet.rounds.length === 0 ? (
        <div className="rounded-2xl border border-edge bg-panel p-10 text-center text-mute">
          This packet doesn't have any rounds yet.
        </div>
      ) : (
        <div className="space-y-6">
          {packet.rounds.map(round => (
            <section key={round.id}>
              <div className="mb-3 flex items-baseline gap-3">
                <h2 className="font-display text-2xl font-bold leading-none">{round.name}</h2>
                {round.duration && <span className="font-mono text-xs text-mute">{round.duration}</span>}
              </div>
              {round.questions.length === 0 ? (
                <div className="rounded-2xl border border-edge bg-panel p-6 text-sm text-mute">No questions in this round yet.</div>
              ) : (
                <div className="space-y-3">
                  {round.questions.map((q, i) => (
                    <div key={q.id} className="relative overflow-hidden rounded-2xl border border-edge bg-panel p-5 shadow-card">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 shrink-0 font-mono text-xs text-mute">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="whitespace-pre-wrap break-words text-base leading-relaxed text-text">{q.displayText}</p>
                          {q.problemLink && (
                            <a
                              href={q.problemLink}
                              target="_blank" rel="noopener noreferrer"
                              className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-aiml/30 bg-aiml/10 px-3 py-1 text-xs font-medium text-aiml transition hover:bg-aiml/20"
                            >
                              {PROBLEM_SOURCE_LABELS[q.problemLinkSource || "MANUAL"]}
                              <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path d="M7 3h10v10h-2V6.4L4.7 16.7 3.3 15.3 13.6 5H7V3z"/></svg>
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

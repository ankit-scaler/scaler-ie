"use client";
import { useEffect, useMemo, useState } from "react";
import FilterBar, { EmptyState } from "@/components/FilterBar";
import { useUrlState } from "@/lib/useUrlState";
import { motion } from "framer-motion";
import Monogram, { Tone } from "./Monogram";
import PacketsSwitch from "@/components/PacketsSwitch";
import { PacketListItem, TRACK_LABELS, YOE_LABELS, Track, YoeBucket } from "@/lib/packets-db";

const PAGE = 30;
// The actual reader lives in the separate Packets Generator app (same one
// this page's data comes from) — "Open Link" sends the learner there by
// slug rather than rendering rounds/questions natively in this app.
const PACKET_GENERATOR_BASE = "https://interview-experiences-packets-creat.vercel.app/p/";

const TONE: Record<Track, Tone> = { ACADEMY: "acad", DEVOPS: "devops", AIML: "aiml", DSML: "dsml" };
const TRACK_TEXT: Record<Track, string> = { ACADEMY: "text-acad", DEVOPS: "text-devops", AIML: "text-aiml", DSML: "text-dsml" };

// Kept in the URL (?track=…&company=…&q=…) so a filtered list can be linked to.
type State = { track: string; yoe: string; company: string; role: string; q: string };
const DEFAULT_STATE: State = { track: "All", yoe: "All", company: "All", role: "All", q: "" };

export default function CompanyPacketsView({ initial }: { initial: PacketListItem[] }) {
  const [state, setState] = useUrlState<State>(DEFAULT_STATE);
  const [visible, setVisible] = useState(PAGE);

  // Same page-visit pattern as Jobs — one event per mount, deduped to
  // "unique learners per day" on the Tracking page.
  useEffect(() => {
    fetch("/api/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "/company-packets" }),
    }).catch(() => {});
  }, []);
  const trackOpen = (slug: string) =>
    fetch("/api/track-packet-open", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug }) }).catch(() => {});

  const tracks = useMemo(
    () => (Object.keys(TRACK_LABELS) as Track[]).filter(t => initial.some(p => p.track === t)),
    [initial]
  );

  // Cascading: Company options are scoped to the current Track/YoE pick,
  // and Role options are further scoped to the current Company pick — same
  // pattern as the Questions/Assignments filters.
  const scopedForCompany = useMemo(
    () => initial.filter(p =>
      (state.track === "All" || p.track === state.track) &&
      (state.yoe === "All" || p.yoeBucket === state.yoe)
    ),
    [initial, state.track, state.yoe]
  );
  const companies = useMemo(
    () => ["All", ...Array.from(new Set(scopedForCompany.map(p => p.company))).sort()],
    [scopedForCompany]
  );
  const roles = useMemo(() => {
    const scope = state.company === "All" ? scopedForCompany : scopedForCompany.filter(p => p.company === state.company);
    return ["All", ...Array.from(new Set(scope.map(p => p.role))).sort()];
  }, [scopedForCompany, state.company]);

  const companyCounts = useMemo(() => {
    const m = new Map<string, number>();
    scopedForCompany.forEach(p => m.set(p.company, (m.get(p.company) || 0) + 1));
    return m;
  }, [scopedForCompany]);
  const active = JSON.stringify(state) !== JSON.stringify(DEFAULT_STATE);

  const filtered = useMemo(() => {
    const qL = state.q.trim().toLowerCase();
    return initial.filter(p =>
      (state.track === "All" || p.track === state.track) &&
      (state.yoe === "All" || p.yoeBucket === state.yoe) &&
      (state.company === "All" || p.company === state.company) &&
      (state.role === "All" || p.role === state.role) &&
      (!qL || `${p.company} ${p.role}`.toLowerCase().includes(qL))
    );
  }, [initial, state]);

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-5"><PacketsSwitch current="company" /></div>
        <span className="font-mono text-[11px] uppercase tracking-widest text-mute">Packets</span>
        <h1 className="mt-1 font-display text-4xl leading-tight sm:text-5xl">
          Company packets,<br /><span className="text-mute">one link away.</span>
        </h1>
      </section>

      <FilterBar
        search={state.q}
        onSearch={q => { setState(s => ({ ...s, q })); setVisible(PAGE); }}
        placeholder="Search a company or role"
        suggestions={companies.filter(c => c !== "All").map(c => ({
          group: "Companies", value: c, count: companyCounts.get(c),
          onPick: () => { setState(s => ({ ...s, company: c, role: "All", q: "" })); setVisible(PAGE); },
        }))}
        segments={{
          value: state.track,
          options: [{ value: "All", label: "All" }, ...tracks.map(t => ({ value: t, label: TRACK_LABELS[t] }))],
          onChange: t => { setState(s => ({ ...s, track: t, company: "All", role: "All" })); setVisible(PAGE); },
        }}
        facets={[
          { key: "company", label: "Company", value: state.company,
            options: companies.filter(c => c !== "All").map(c => ({ value: c, count: companyCounts.get(c) })),
            onChange: c => { setState(s => ({ ...s, company: c, role: "All" })); setVisible(PAGE); } },
          { key: "role", label: "Role", value: state.role,
            options: roles.filter(r => r !== "All").map(r => ({ value: r })),
            onChange: r => { setState(s => ({ ...s, role: r })); setVisible(PAGE); } },
          { key: "yoe", label: "Experience", value: state.yoe, searchable: false,
            options: (Object.keys(YOE_LABELS) as YoeBucket[]).map(y => ({ value: y, label: YOE_LABELS[y] })),
            onChange: y => { setState(s => ({ ...s, yoe: y, company: "All", role: "All" })); setVisible(PAGE); } },
        ]}
        onClearAll={() => { setState(DEFAULT_STATE); setVisible(PAGE); }}
      />


      <section>
        <div className="mb-3 font-mono text-sm text-mute">
          {filtered.length.toLocaleString()} packet{filtered.length === 1 ? "" : "s"}
        </div>
        {filtered.length === 0 ? (
          <EmptyState onClear={active ? () => { setState(DEFAULT_STATE); setVisible(PAGE); } : undefined} />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.slice(0, visible).map((p, i) => (
              <motion.div
                key={p.slug}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.02, 0.3) }}
                whileHover={{ y: -3 }}
              >
                <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-edge bg-panel p-5 shadow-card transition-shadow hover:shadow-cardH">
                  <div className="mb-3 flex items-center gap-3">
                    <Monogram name={p.company} tone={TONE[p.track]} />
                    <div className="min-w-0">
                      <div className="break-words font-display text-base font-semibold leading-tight">{p.company}</div>
                      <div className="break-words text-sm text-mute">{p.role}</div>
                    </div>
                    <span className={`ml-auto inline-flex shrink-0 items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider ${TRACK_TEXT[p.track]}`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />{TRACK_LABELS[p.track]}
                    </span>
                  </div>
                  <div className="mb-4 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-edge px-3 py-1 text-mute">{YOE_LABELS[p.yoeBucket]}</span>
                  </div>
                  <a
                    href={`${PACKET_GENERATOR_BASE}${p.slug}`}
                    target="_blank" rel="noopener noreferrer"
                    onClick={() => trackOpen(p.slug)}
                    className="mt-auto inline-flex min-h-10 w-fit items-center gap-2 rounded-xl border border-acad bg-acad px-4 py-2 text-sm font-medium text-ink transition hover:opacity-90"
                  >
                    Open Link
                    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M7 3h10v10h-2V6.4L4.7 16.7 3.3 15.3 13.6 5H7V3z"/></svg>
                  </a>
                </div>
              </motion.div>
            ))}
          </div>
        )}
        {visible < filtered.length && (
          <div className="mt-8 text-center">
            <button
              onClick={() => setVisible(v => v + PAGE)}
              className="rounded-full border border-edge bg-panel px-5 py-2.5 text-sm text-text transition hover:border-text/40"
            >Load more</button>
          </div>
        )}
      </section>
    </div>
  );
}

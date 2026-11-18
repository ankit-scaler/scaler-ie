"use client";
import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import LoadingLink from "./LoadingLink";
import { useUrlParam } from "@/lib/useUrlParam";
import { trackResumeEvent } from "@/lib/model-resume-events";
import {
  BG_LABELS, COPY, EXP_BANDS, EXP_LABELS, PROGRAMS, PROGRAM_TEXT, backgroundsForBand,
  type Background, type ExpBand, type Program, type ResumeCard,
} from "@/lib/model-resumes-types";

const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

// Same look as components/Filters.tsx (Questions / Assignments): programme as
// pills, everything else as labelled dropdowns.
function PillRow({ options, value, onChange }: {
  options: { value: string; label: string }[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {[{ value: "All", label: COPY.list.all }, ...options].map(o => (
        <motion.button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          whileTap={{ scale: 0.96 }}
          transition={{ duration: 0.1 }}
          className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors duration-200 ${
            value === o.value ? "border-text bg-text text-ink" : "border-edge text-mute hover:border-text/40 hover:text-text"
          }`}
        >{o.label}</motion.button>
      ))}
    </div>
  );
}

function SelectField({ label, accent, value, options, onChange }: {
  label: string; accent: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void;
}) {
  return (
    <label className="group flex min-w-0 flex-col gap-1.5">
      <span className={`font-mono text-[11px] font-semibold uppercase tracking-widest ${accent}`}>{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full appearance-none rounded-xl border border-edge bg-panel px-3 py-2.5 pr-9 text-sm text-text transition-colors focus:border-acad focus:outline-none group-hover:border-text/40"
        >
          {[{ value: "All", label: COPY.list.all }, ...options].map(o => (
            <option key={o.value} value={o.value} className="bg-panel">{o.label}</option>
          ))}
        </select>
        <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute transition-colors duration-200 group-hover:text-text" viewBox="0 0 20 20" fill="currentColor">
          <path d="M5 8l5 5 5-5H5z" />
        </svg>
      </div>
    </label>
  );
}

export default function ModelResumesList({ cards }: { cards: ResumeCard[] }) {
  const [program, setProgram] = useUrlParam("program", "All");
  const [band, setBand] = useUrlParam("band", "All");
  const [bg, setBg] = useUrlParam("bg", "All");

  // A URL value that isn't a real option (hand-edited link) behaves as "All".
  const programV = (PROGRAMS as string[]).includes(program) ? (program as Program) : "All";
  const bandV = (EXP_BANDS as string[]).includes(band) ? (band as ExpBand) : "All";
  const bgOptions = backgroundsForBand(bandV);
  // Background depends on Experience: if the chosen one isn't offered under
  // the current band, it falls back to All.
  const bgV = (bgOptions as string[]).includes(bg) ? (bg as Background) : "All";

  useEffect(() => {
    trackResumeEvent("list_view", { detail: { query: window.location.search } });
  }, []);

  const change = (key: "program" | "bg", setter: (v: string) => void) => (v: string) => {
    setter(v);
    trackResumeEvent("filter", { detail: { program: programV, band: bandV, bg: bgV, [key]: v } });
  };
  const onBand = (v: string) => {
    setBand(v);
    const allowed = backgroundsForBand(v as ExpBand | "All") as string[];
    const nextBg = allowed.includes(bg) ? bg : "All";
    if (nextBg !== bg) setBg(nextBg);
    trackResumeEvent("filter", { detail: { program: programV, band: v, bg: nextBg } });
  };

  const filtered = useMemo(
    () => cards.filter(c =>
      (programV === "All" || c.program === programV) &&
      (bandV === "All" || c.exp_band === bandV) &&
      (bgV === "All" || c.background === bgV)
    ),
    [cards, programV, bandV, bgV]
  );

  return (
    <div className="space-y-8">
      <section>
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">
          Resumes that work,<br /><span className="text-mute">by role and experience.</span>
        </h1>
      </section>

      <section className="space-y-4">
        <PillRow
          options={PROGRAMS.map(p => ({ value: p, label: p }))}
          value={programV}
          onChange={change("program", setProgram)}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <SelectField
            label={COPY.list.filter_experience} accent="text-acad"
            value={bandV} onChange={onBand}
            options={EXP_BANDS.map(b => ({ value: b, label: EXP_LABELS[b] }))}
          />
          <SelectField
            label={COPY.list.filter_background} accent="text-dsml"
            value={bgV} onChange={change("bg", setBg)}
            options={bgOptions.map(b => ({ value: b, label: BG_LABELS[b] }))}
          />
        </div>
      </section>

      <section>
        <div className="mb-3 font-mono text-sm text-mute">
          {filtered.length === 1 ? COPY.list.count_one : fill(COPY.list.count, { n: filtered.length.toLocaleString() })}
        </div>
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-edge bg-panel p-10 text-center text-mute">{COPY.list.empty}</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((c, i) => (
              <motion.div
                key={c.slug}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.02, 0.3) }}
                whileHover={{ y: -3 }}
              >
                <LoadingLink
                  href={`/resumes/${c.slug}`}
                  className="group flex h-full flex-col gap-3 rounded-2xl border border-edge bg-panel p-5 shadow-card transition-shadow hover:shadow-cardH"
                >
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border border-edge px-2.5 py-1 font-mono uppercase tracking-wider ${PROGRAM_TEXT[c.program]}`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />{c.program}
                    </span>
                    <span className="rounded-full border border-edge px-2.5 py-1 text-mute">{c.exp_label}</span>
                    <span className="rounded-full border border-edge px-2.5 py-1 text-mute">{c.background_label}</span>
                  </div>
                  <h2 className="font-display text-lg font-semibold leading-snug">{c.headline}</h2>
                  <p className="text-sm text-mute">{c.persona}</p>
                  <div className="mt-auto pt-1 font-mono text-xs text-mute">
                    {fill(COPY.list.card_meta, { pct: c.bullets_with_numbers_pct, notes: c.note_count })}
                  </div>
                </LoadingLink>
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

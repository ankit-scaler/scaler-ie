"use client";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import LoadingLink from "./LoadingLink";
import ReviewPopup from "./ReviewPopup";
import { FlightSpinner } from "./FlightLoader";
import { COPY, PROGRAM_TEXT, type Entry, type Note, type ResumeFull } from "@/lib/model-resumes-types";
import { trackResumeEvent } from "@/lib/model-resume-events";

const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

// A note's target -> the data-key of the line it belongs to.
const tkey = (t: Note["target"]) =>
  t.bullet_id ? `b:${t.bullet_id}` : t.entry ? `e:${t.entry}` : `s:${t.section}`;

// Underline the exact STAR parts inside a bullet, as React nodes (no raw HTML).
function renderStar(text: string, star?: Note["star"]) {
  if (!star?.length) return text;
  const spans = star
    .map(p => ({ k: p.k, i: text.indexOf(p.text), len: p.text.length }))
    .filter(s => s.i >= 0)
    .sort((a, b) => a.i - b.i);
  const out: React.ReactNode[] = [];
  let cur = 0;
  spans.forEach((s, idx) => {
    if (s.i < cur) return;
    if (s.i > cur) out.push(text.slice(cur, s.i));
    out.push(<mark key={idx} className={`rp-mark rp-${s.k}`}>{text.slice(s.i, s.i + s.len)}</mark>);
    cur = s.i + s.len;
  });
  if (cur < text.length) out.push(text.slice(cur));
  return out;
}

function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 1000px)");
    const f = () => setWide(m.matches);
    f();
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return wide;
}

function NoteCard({ note, open, mixed, lineText, inline, onToggle, cardRef }: {
  note: Note; open: boolean; mixed: boolean; lineText?: string; inline?: boolean;
  onToggle: () => void; cardRef?: (el: HTMLDivElement | null) => void;
}) {
  const kinds = COPY.notes.kind_labels as Record<string, string>;
  const letters = COPY.notes.star_letters as Record<string, string>;
  return (
    <div
      ref={cardRef}
      className={`rp-note ${open ? "open" : ""} ${inline ? "inline" : ""}`}
      tabIndex={0}
      role="button"
      aria-expanded={open}
      onClick={e => { e.stopPropagation(); onToggle(); }}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onToggle(); } }}
    >
      <div className="rp-nh">
        <span className="rp-nnum">{note.number}</span>
        {mixed && <span>{kinds[note.kind]}</span>}
      </div>
      <div className="rp-nt">{note.title}</div>
      {open && (
        <>
          <div className="rp-nb">{note.body}</div>
          {note.star && (
            <>
              <div className="rp-sub">{COPY.notes.star_sublabel}</div>
              <div className="rp-star">
                {note.star.map((p, i) => (
                  <div key={i} className={p.k}><b title={letters[p.k]}>{p.k}</b><span>{p.text}</span></div>
                ))}
              </div>
            </>
          )}
          {note.weaker && lineText && (
            <div className="rp-vs">
              <div className="weak"><span>{COPY.notes.weaker_label}</span>{note.weaker}</div>
              <div className="strong"><span>{COPY.notes.this_resume_label}</span>{lineText}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ModelResumeReader({ resume: R, pdfEnabled }: { resume: ResumeFull; pdfEnabled: boolean }) {
  const wide = useWide();
  const [active, setActive] = useState<string | null>(null);
  const [popup, setPopup] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const cardEls = useRef<Record<string, HTMLDivElement | null>>({});
  const closePopup = useCallback(() => setPopup(false), []);

  const noteByKey = useMemo(() => {
    const m = new Map<string, Note>();
    R.notes.forEach(n => m.set(tkey(n.target), n));
    return m;
  }, [R.notes]);
  const bulletText = useMemo(() => {
    const m = new Map<string, string>();
    [...R.resume.work, ...R.resume.projects].forEach(e => e.bullets.forEach(b => m.set(b.id, b.text)));
    return m;
  }, [R.resume]);
  const mixed = useMemo(() => new Set(R.notes.map(n => n.kind)).size > 1, [R.notes]);

  useEffect(() => { trackResumeEvent("resume_view", { slug: R.slug }); }, [R.slug]);

  const toggle = (n: Note) => {
    const next = active === n.id ? null : n.id;
    setActive(next);
    if (next) trackResumeEvent("note_open", { slug: R.slug, detail: { note: n.id } });
  };

  // >= 1000px: place each note card level with its line; if it would overlap
  // the card above, push it 8px below that one so notes keep reading order.
  const layout = useCallback(() => {
    const rail = railRef.current, paper = paperRef.current;
    if (!rail || !paper) return;
    if (!wide) { rail.style.height = ""; return; }
    const top0 = rail.getBoundingClientRect().top + window.scrollY;
    let floor = 0;
    for (const n of R.notes) {
      const card = cardEls.current[n.id];
      const el = paper.querySelector<HTMLElement>(`[data-key="${tkey(n.target)}"]`);
      if (!card || !el) continue;
      const want = el.getBoundingClientRect().top + window.scrollY - top0;
      const y = Math.max(want, floor);
      card.style.top = `${y}px`;
      card.style.visibility = "visible";
      floor = y + card.offsetHeight + 8;
    }
    rail.style.height = `${Math.max(floor, paper.offsetHeight)}px`;
  }, [R.notes, wide]);

  useLayoutEffect(() => { layout(); }, [layout, active]);
  useEffect(() => {
    const ro = new ResizeObserver(() => layout());
    if (paperRef.current) ro.observe(paperRef.current);
    window.addEventListener("resize", layout);
    return () => { ro.disconnect(); window.removeEventListener("resize", layout); };
  }, [layout]);

  const openReview = (from: "header" | "end") => {
    trackResumeEvent("mentor_cta", { slug: R.slug, detail: { from } });
    setPopup(true);
  };

  const downloadPdf = async () => {
    setPdfBusy(true);
    setPdfError(null);
    try {
      const res = await fetch(`/api/model-resumes/pdf?slug=${encodeURIComponent(R.slug)}`);
      const j = await res.json().catch(() => ({ ok: false }));
      if (!j.ok || !j.url) { setPdfError(j.error || "Couldn't prepare the PDF. Try again."); return; }
      window.location.assign(j.url);
    } catch {
      setPdfError("Couldn't prepare the PDF. Try again.");
    } finally {
      setPdfBusy(false);
    }
  };

  // "See it in this resume": open the first note that shows the rule, then
  // centre its line. The only place this page scrolls by itself.
  const seeExample = (ruleId: string) => {
    const n = R.notes.find(x => (x.rules || []).includes(ruleId));
    if (!n) return;
    setActive(n.id);
    trackResumeEvent("see_example", { slug: R.slug, detail: { rule: ruleId } });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      paperRef.current?.querySelector<HTMLElement>(`[data-key="${tkey(n.target)}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }));
  };

  /* ---------- paper pieces ---------- */
  const lineCls = (key: string) => {
    const n = noteByKey.get(key);
    return n ? `rp-annot ${n.id === active ? "rp-active" : ""}` : "";
  };
  const lineProps = (key: string) => {
    const n = noteByKey.get(key);
    if (!n) return { "data-key": key };
    return {
      "data-key": key,
      tabIndex: 0,
      onClick: () => toggle(n),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(n); }
      },
    };
  };
  const badge = (key: string) => {
    const n = noteByKey.get(key);
    if (!n) return null;
    return (
      <button type="button" className="rp-mk" tabIndex={-1}
        aria-label={`Note ${n.number}: ${n.title}`} aria-expanded={n.id === active}
        onClick={e => { e.stopPropagation(); toggle(n); }}>{n.number}</button>
    );
  };
  // Narrow screens: the open note sits directly under its line.
  const inlineNote = (key: string) => {
    if (wide || !active) return null;
    const n = noteByKey.get(key);
    if (!n || n.id !== active) return null;
    return (
      <NoteCard inline note={n} open mixed={mixed}
        lineText={n.target.bullet_id ? bulletText.get(n.target.bullet_id) : undefined}
        onToggle={() => toggle(n)} />
    );
  };

  const entryBlock = (sec: "work" | "projects") => (e: Entry, ei: number) => {
    const key = `e:${sec}:${ei}`;
    const inl = inlineNote(key);
    return (
      <div className="rp-ent" key={ei}>
        <div className={`rp-jh ${lineCls(key)}`} {...lineProps(key)}>
          {badge(key)}
          <span>{e.title}</span>
          {e.dates && <span className="rp-d">{e.dates}</span>}
        </div>
        {inl}
        {e.stack?.length ? <div className="rp-stack">{e.stack.join(" · ")}</div>
          : e.org_hidden ? <div className="rp-stack"><span className="rp-bar grey" style={{ width: "11em" }} /></div> : null}
        <ul className="rp-ul">
          {e.bullets.map(b => {
            const k = `b:${b.id}`;
            const n = noteByKey.get(k);
            const il = inlineNote(k);
            return (
              <Fragment key={b.id}>
                <li className={lineCls(k)} {...lineProps(k)}>
                  {badge(k)}
                  {n && n.id === active && n.star ? renderStar(b.text, n.star) : b.text}
                </li>
                {il && <li className="rp-inline">{il}</li>}
              </Fragment>
            );
          })}
        </ul>
      </div>
    );
  };

  const section = (id: string, title: string, body: React.ReactNode) => {
    const key = `s:${id}`;
    return (
      <div className="rp-sec" key={id}>
        <h4 className={lineCls(key)} {...lineProps(key)}>{badge(key)}{title}</h4>
        {inlineNote(key)}
        {body}
      </div>
    );
  };

  // "Tap any numbered line…": a highlighted callout so learners see that the
  // numbered lines and note cards are interactive.
  const howto = (
    <div className="flex items-start gap-3 rounded-2xl border border-acad/50 bg-acad/10 px-4 py-3 text-sm shadow-card">
      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-acad text-ink">
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden><path d="M4 3l12 6.5-5 1.5-2 5.5z" /></svg>
      </span>
      <span className="font-medium leading-snug text-text">{COPY.detail.howto}</span>
    </div>
  );

  const res = R.resume;
  const sec = COPY.detail.sections;
  const doRules = R.rules.filter(r => r.kind === "do");
  const dontRules = R.rules.filter(r => r.kind === "dont");
  const hasExample = (id: string) => R.notes.some(n => (n.rules || []).includes(id));
  const checkCol = (title: string, kind: "do" | "dont", list: typeof R.rules) => (
    <div className="rounded-2xl border border-edge bg-panel p-5">
      <h3 className="mb-3 font-display text-base font-semibold">{title}</h3>
      <ul className="space-y-3">
        {list.map(r => (
          <li key={r.id} className="flex gap-3 text-sm">
            <span aria-hidden className={`mt-0.5 shrink-0 font-bold ${kind === "do" ? "text-aiml" : "text-red-500"}`}>{kind === "do" ? "✓" : "✕"}</span>
            <span>
              {r.text}
              {hasExample(r.id) && (
                <> <button type="button" onClick={() => seeExample(r.id)}
                  className="font-medium text-acad underline-offset-2 hover:underline">{COPY.checklist.see_example}</button></>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="space-y-8">
      <LoadingLink href="/resumes" className="inline-block text-sm text-mute transition hover:text-text">{COPY.detail.back}</LoadingLink>

      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
            <span className={`inline-flex items-center gap-1.5 rounded-full border border-edge px-2.5 py-1 font-mono uppercase tracking-wider ${PROGRAM_TEXT[R.program]}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />{R.program}
            </span>
            <span className="rounded-full border border-edge px-2.5 py-1 text-mute">{R.exp_label}</span>
            <span className="rounded-full border border-edge px-2.5 py-1 text-mute">{R.background_label}</span>
          </div>
          <h1 className="font-display text-3xl leading-tight sm:text-4xl">{R.headline}</h1>
          <p className="mt-2 text-sm text-mute">{R.persona}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pdfEnabled && (
            <button onClick={downloadPdf} disabled={pdfBusy}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-edge px-4 py-2 text-sm text-text transition hover:border-text/40 disabled:opacity-60">
              {pdfBusy && <FlightSpinner className="!h-4 !w-4" />}{COPY.detail.download_pdf}
            </button>
          )}
          <button onClick={() => openReview("header")}
            className="inline-flex min-h-10 items-center rounded-xl bg-acad px-4 py-2 text-sm font-semibold text-ink transition hover:opacity-90">
            {COPY.detail.book_review}
          </button>
        </div>
      </section>
      {pdfError && <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-500">{pdfError}</div>}

      <section className="rounded-2xl border border-edge bg-panel p-5">
        <h2 className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-mute">{COPY.detail.recruiters_title}</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {R.recruiters.map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      </section>

      {/* Narrow screens: the callout sits above the resume. */}
      <div className="min-[1000px]:hidden">{howto}</div>

      <div className="grid gap-6 min-[1000px]:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div ref={paperRef} className="rp-paper">
            <div className="rp-strip">
              <span><b>{fill(COPY.detail.paper_strip_left, { program: R.program, exp_label: R.exp_label, background_label: R.background_label })}</b></span>
              <span>{COPY.detail.paper_strip_right}</span>
            </div>
            <div><span className="rp-bar" style={{ width: "13em", height: "1.1em" }} /></div>
            <div className="rp-ct">
              <span className="rp-bar" style={{ width: "9em" }} />
              <span className="rp-bar" style={{ width: "6em" }} />
              <span>{COPY.detail.contact_hidden}</span>
            </div>
            {res.work.length > 0 && section("work", sec.work, res.work.map(entryBlock("work")))}
            {res.projects.length > 0 && section("projects", sec.projects, res.projects.map(entryBlock("projects")))}
            {res.education.length > 0 && section("education", sec.education, res.education.map((e, i) => <div key={i}>{e}</div>))}
            {res.skills.length > 0 && section("skills", sec.skills, <div className="rp-chips">{res.skills.map((s, i) => <span key={i}>{s}</span>)}</div>)}
            {res.achievements.length > 0 && section("achievements", sec.achievements, <ul className="rp-ul">{res.achievements.map((a, i) => <li key={i}>{a}</li>)}</ul>)}
          </div>
        </div>
        <div className="min-w-0 space-y-4">
          {/* Wide screens: the callout heads the notes column. */}
          <div className="hidden min-[1000px]:block">{howto}</div>
          <div ref={railRef} className="rp-rail hidden min-[1000px]:block">
            {R.notes.map(n => (
              <NoteCard key={n.id} note={n} open={n.id === active} mixed={mixed}
                lineText={n.target.bullet_id ? bulletText.get(n.target.bullet_id) : undefined}
                onToggle={() => toggle(n)}
                cardRef={el => { cardEls.current[n.id] = el; }} />
            ))}
          </div>
        </div>
      </div>

      <section>
        <h2 className="font-display text-2xl">{COPY.checklist.title}</h2>
        <p className="mb-4 mt-1 text-sm text-mute">{COPY.checklist.lede}</p>
        <div className="grid gap-4 md:grid-cols-2">
          {checkCol(COPY.checklist.do, "do", doRules)}
          {checkCol(COPY.checklist.dont, "dont", dontRules)}
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-edge bg-panel p-5">
        <div>
          <div className="font-display text-lg font-semibold">{COPY.end_cta.title}</div>
          <div className="mt-1 text-sm text-mute">{COPY.end_cta.body}</div>
        </div>
        <button onClick={() => openReview("end")}
          className="inline-flex min-h-10 items-center rounded-xl bg-acad px-4 py-2 text-sm font-semibold text-ink transition hover:opacity-90">
          {COPY.end_cta.button}
        </button>
      </section>

      <ReviewPopup open={popup} onClose={closePopup} slug={R.slug} />
    </div>
  );
}

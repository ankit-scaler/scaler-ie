"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FlightSpinner } from "./FlightLoader";
import { COPY } from "@/lib/model-resumes-types";
import { trackResumeEvent } from "@/lib/model-resume-events";

// "How to book a resume review with your mentor": Loom walkthrough + a link
// to the learner's Scaler dashboard. Plain translucent overlay (no
// backdrop-blur) so opening it doesn't stall the page behind it.
export default function ReviewPopup({ open, onClose, slug }: { open: boolean; onClose: () => void; slug: string }) {
  const [videoReady, setVideoReady] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const t = COPY.review_popup;

  useEffect(() => {
    if (!open) { setVideoReady(false); return; }
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      // Keep keyboard focus inside the dialog while it is open.
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),iframe,[tabindex]:not([tabindex='-1'])");
      if (!nodes?.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); opener?.focus?.(); };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-ink/80 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t.title}
        className="w-full max-w-2xl rounded-2xl border border-edge bg-panel p-5 shadow-cardH sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-xl leading-snug">{t.title}</h2>
          <button ref={closeRef} onClick={onClose} aria-label={t.close_label}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-edge text-mute transition hover:border-text/40 hover:text-text">
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M5 5l10 10M15 5L5 15" /></svg>
          </button>
        </div>

        <div className="relative mt-4 aspect-video w-full overflow-hidden rounded-xl border border-edge bg-panel2">
          {!videoReady && <div className="absolute inset-0 grid place-items-center"><FlightSpinner /></div>}
          <iframe
            src={COPY.settings.loom_embed_url}
            title={t.title}
            allow="fullscreen; picture-in-picture"
            allowFullScreen
            onLoad={() => setVideoReady(true)}
            className="absolute inset-0 h-full w-full"
          />
        </div>

        <p className="mt-4 text-sm text-mute">{t.steps}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={COPY.settings.scaler_dashboard_url}
            target="_blank" rel="noopener noreferrer"
            onClick={() => trackResumeEvent("mentor_dashboard_cta", { slug })}
            className="inline-flex items-center gap-2 rounded-xl bg-acad px-4 py-2 text-sm font-semibold text-ink transition hover:opacity-90"
          >{t.primary_button}</a>
          <a
            href={COPY.settings.loom_share_url}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-edge px-4 py-2 text-sm text-text transition hover:border-text/40"
          >{t.secondary_button}</a>
        </div>
      </div>
    </div>,
    document.body
  );
}

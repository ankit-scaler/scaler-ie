"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { supabaseBrowser } from "@/lib/supabase-browser";
import {
  SESSION_KEY, CARD_DELAY_MS, PULSE_MS, loadState, saveState, recordVisit, pulseActive,
  shouldShowCard, snooze, optOutForever, markSubmitted,
} from "@/lib/feedback-nudge";

const safe = (get: () => Storage) => { try { return get(); } catch { return null; } };
const local = () => safe(() => window.localStorage);
const session = () => safe(() => window.sessionStorage);

function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          className={`text-2xl leading-none transition ${n <= value ? "text-acad" : "text-edge hover:text-mute"}`}
        >★</button>
      ))}
    </div>
  );
}

export default function FeedbackWidget() {
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [platformRating, setPlatformRating] = useState(0);
  const [usefulnessRating, setUsefulnessRating] = useState(0);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);
  const [card, setCard] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const sb = supabaseBrowser();
    // Local session, no network call: this only decides whether to show the
    // button, and the feedback API verifies the login itself.
    sb.auth.getSession().then(({ data }) => setEmail(data.session?.user?.email ?? null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => setEmail(session?.user?.email ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Count this visit (once per IST day) and pulse the button briefly.
  useEffect(() => {
    if (!email) return;
    const st = recordVisit(loadState(local()), Date.now());
    saveState(local(), st);
    if (!pulseActive(st, Date.now())) return;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), PULSE_MS);
    return () => clearTimeout(t);
  }, [email]);

  // The card appears only after the learner has stayed on a page for a while,
  // at most once per session, and never when snoozed / opted out / recently answered.
  useEffect(() => {
    if (!email) return;
    setCard(false);
    const t = setTimeout(() => {
      const shown = session()?.getItem(SESSION_KEY) === "1";
      if (!shouldShowCard(loadState(local()), Date.now(), { shownThisSession: shown, pathname })) return;
      try { session()?.setItem(SESSION_KEY, "1"); } catch { /* ignore */ }
      setCard(true);
    }, CARD_DELAY_MS);
    return () => clearTimeout(t);
  }, [email, pathname]);

  if (!email) return null;

  const update = (f: (s: ReturnType<typeof loadState>) => ReturnType<typeof loadState>) => saveState(local(), f(loadState(local())));
  const notNow = () => { update(s => snooze(s, Date.now())); setCard(false); };
  const never = () => { update(s => optOutForever(s)); setCard(false); setPulse(false); };
  const rateFromCard = (n: number) => {
    update(s => snooze(s, Date.now())); // asked once; if they bail from the form we don't ask again for 2 weeks
    setCard(false); setUsefulnessRating(n); setOpen(true);
  };

  const reset = () => {
    setPlatformRating(0); setUsefulnessRating(0); setText(""); setDone(false); setError(null);
  };

  const submit = async () => {
    if (!platformRating || !usefulnessRating) { setError("Please rate both questions."); return; }
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/feedback", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ platform_rating: platformRating, usefulness_rating: usefulnessRating, feedback_text: text }),
    });
    const j = await res.json().catch(() => ({ ok: false }));
    setSubmitting(false);
    if (j.ok) { setDone(true); update(s => markSubmitted(s, Date.now())); setPulse(false); }
    else setError(j.error || "Couldn't submit feedback.");
  };

  return (
    <>
      <motion.button
        onClick={() => setOpen(true)}
        whileTap={{ scale: 0.96 }}
        transition={{ duration: 0.1 }}
        className={`fixed bottom-5 right-5 z-40 rounded-full bg-text px-4 py-2.5 text-sm font-medium text-ink shadow-cardH transition-opacity duration-200 hover:opacity-90 ${pulse ? "fb-pulse" : ""}`}
      >
        Share feedback
      </motion.button>

      {card && !open && (
        <div role="dialog" aria-label="Quick feedback" className="animate-fade-in-up fixed bottom-20 right-5 z-40 w-72 max-w-[calc(100vw-2.5rem)] rounded-2xl border border-edge bg-panel p-4 shadow-cardH">
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm font-medium">How useful is the Vault for your interview prep?</div>
            <button onClick={notNow} className="text-mute hover:text-text" aria-label="Close">✕</button>
          </div>
          <div className="mt-2.5"><Stars value={0} onChange={rateFromCard} /></div>
          <div className="mt-3 flex items-center justify-between text-xs text-mute">
            <button onClick={notNow} className="hover:text-text">Not now</button>
            <button onClick={never} className="hover:text-text">Don’t ask again</button>
          </div>
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center sm:justify-end"
          onClick={() => { setOpen(false); if (done) reset(); }}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-edge bg-panel p-5 shadow-cardH sm:mb-5 sm:mr-2"
            onClick={e => e.stopPropagation()}
          >
            {done ? (
              <div className="py-6 text-center">
                <div className="mb-2 font-display text-xl">Thanks!</div>
                <p className="mb-4 text-sm text-mute">Your feedback helps us improve the Vault.</p>
                <button
                  onClick={() => { setOpen(false); reset(); }}
                  className="rounded-xl bg-text px-4 py-2 text-sm font-medium text-ink"
                >Close</button>
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <div className="font-display text-lg">Share feedback</div>
                  <button onClick={() => setOpen(false)} className="text-mute hover:text-text" aria-label="Close">✕</button>
                </div>

                <div className="mb-4">
                  <div className="mb-1.5 text-sm">How would you rate Scaler Vault as a platform?</div>
                  <Stars value={platformRating} onChange={setPlatformRating} />
                </div>
                <div className="mb-4">
                  <div className="mb-1.5 text-sm">How useful is Scaler Vault for interview preparation?</div>
                  <Stars value={usefulnessRating} onChange={setUsefulnessRating} />
                </div>
                <div className="mb-4">
                  <div className="mb-1.5 text-sm">Write feedback <span className="text-mute">(optional)</span></div>
                  <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    rows={3}
                    placeholder="What's working, what's not..."
                    className="w-full rounded-xl border border-edge bg-panel2 px-3 py-2 text-sm text-text placeholder:text-mute/60 focus:border-acad focus:outline-none"
                  />
                </div>
                {error && (
                  <div className="mb-3 rounded-xl border border-devops/40 bg-devops/10 px-3 py-2 text-sm text-devops">{error}</div>
                )}
                <button
                  onClick={submit}
                  disabled={submitting}
                  className="w-full rounded-xl bg-text px-4 py-2.5 text-sm font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
                >{submitting ? "Submitting…" : "Submit feedback"}</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

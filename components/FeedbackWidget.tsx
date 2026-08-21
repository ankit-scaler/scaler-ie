"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

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

  useEffect(() => {
    const sb = supabaseBrowser();
    sb.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => setEmail(session?.user?.email ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!email) return null;

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
    if (j.ok) setDone(true);
    else setError(j.error || "Couldn't submit feedback.");
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 rounded-full bg-text px-4 py-2.5 text-sm font-medium text-ink shadow-cardH transition hover:opacity-90"
      >
        Share feedback
      </button>

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

"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Result = { matched: true; link: string } | { matched: false } | null;
type PacketOption = { company: string; role: string };

const EMPTY_FORM = { company: "", role: "" };

// No existing packet -> the learner requests one through this form.
const REQUEST_FORM_URL = "https://interviewbit.typeform.com/to/EoyLKy6w";

export default function RequestPacketButton() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result>(null);
  const [options, setOptions] = useState<PacketOption[]>([]);

  // Loaded once, used to drive the Company/Role datalists — existing names
  // to pick from (so a selection is guaranteed to exact-match in the
  // backend's lookup), but a learner can still type something new if
  // there's no entry for it yet.
  useEffect(() => {
    fetch("/api/packet-options")
      .then(res => res.json())
      .then(j => { if (j.ok) setOptions(j.options); })
      .catch(() => {});
  }, []);

  const companies = useMemo(
    () => Array.from(new Set(options.map(o => o.company))).sort(),
    [options]
  );
  // Scoped to the currently-typed company (case-insensitive) so the Role
  // suggestions narrow down once a company is picked — falls back to every
  // known role when the company doesn't match anything yet.
  const roles = useMemo(() => {
    const cL = form.company.trim().toLowerCase();
    const scope = cL ? options.filter(o => o.company.toLowerCase() === cL) : options;
    const pool = scope.length ? scope : options;
    return Array.from(new Set(pool.map(o => o.role))).sort();
  }, [options, form.company]);

  const close = () => {
    setOpen(false);
    setForm(EMPTY_FORM);
    setError(null);
    setResult(null);
  };

  // `backdrop-blur` on a full-viewport overlay forces the browser to
  // recompute a blur over everything behind it every frame — on this page
  // that's ~30 animated, shadowed job cards, which can visibly stall/"freeze"
  // the tab for a moment right as the modal opens. A plain translucent
  // overlay (no blur) costs far less to composite and reads just as clearly
  // as a dimmed background.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const submit = async () => {
    if (!form.company.trim() || !form.role.trim()) {
      setError("Company and role are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/request-packet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await res.json().catch(() => ({ ok: false }));
      if (!j.ok) {
        setError(j.error || "Couldn't submit the request. Try again.");
        return;
      }
      setResult(j.matched ? { matched: true, link: j.link } : { matched: false });
    } catch {
      setError("Couldn't submit the request. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Outer ring is a spinning conic-gradient; the button sits on top
          with its own solid background, so only the 2px gap between them
          shows the moving gradient — a lightweight "animated border" with
          no extra libraries. Easy to miss as a plain outline pill before
          this, so it also gets a solid accent fill instead of a faint
          border/10% tint. */}
      <div className="relative shrink-0 overflow-hidden rounded-full p-[2px]">
        <div
          className="absolute inset-[-50%] animate-[spin_2.5s_linear_infinite] motion-reduce:animate-none"
          style={{ background: "conic-gradient(from 0deg, rgb(var(--acad)), transparent 30%, transparent 70%, rgb(var(--acad)))" }}
        />
        <button
          onClick={() => setOpen(true)}
          className="relative z-10 rounded-full bg-acad px-4 py-2 text-sm font-semibold text-ink shadow-[0_0_16px_-2px_rgb(var(--acad)/0.7)] transition hover:opacity-90"
        >
          Request Packet
        </button>
      </div>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/80 p-4"
          onClick={e => { if (e.target === e.currentTarget) close(); }}
        >
          <div className="w-full max-w-md rounded-2xl border border-edge bg-panel p-6 shadow-cardH">
            {result ? (
              <>
                <div className="mb-1 font-mono text-[11px] uppercase tracking-widest text-mute">Request Packet</div>
                {result.matched ? (
                  <>
                    <h2 className="mt-1 font-display text-xl leading-snug">Good news — this packet already exists.</h2>
                    <a
                      href={result.link}
                      target="_blank" rel="noopener noreferrer"
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-text px-3.5 py-2 text-sm font-medium text-ink transition hover:opacity-90"
                    >
                      Open Link
                      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M7 3h10v10h-2V6.4L4.7 16.7 3.3 15.3 13.6 5H7V3z"/></svg>
                    </a>
                  </>
                ) : (
                  <>
                    <h2 className="mt-1 font-display text-xl leading-snug">No packet yet for this company & role.</h2>
                    <p className="mt-2 text-sm text-mute">Fill in the request form and the team will follow up once it's ready.</p>
                    <a
                      href={REQUEST_FORM_URL}
                      target="_blank" rel="noopener noreferrer"
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-text px-3.5 py-2 text-sm font-medium text-ink transition hover:opacity-90"
                    >
                      Open request form
                      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M7 3h10v10h-2V6.4L4.7 16.7 3.3 15.3 13.6 5H7V3z"/></svg>
                    </a>
                  </>
                )}
                <button
                  onClick={close}
                  className="mt-5 w-full rounded-xl border border-edge px-4 py-2 text-sm text-text transition hover:border-text/40"
                >Close</button>
              </>
            ) : (
              <>
                <div className="mb-1 font-mono text-[11px] uppercase tracking-widest text-mute">Request Packet</div>
                <h2 className="mt-1 font-display text-xl leading-snug">Looking for a specific company & role?</h2>
                <p className="mb-4 text-xs text-mute">Start typing to see existing packets — pick one if it's already there, or just keep typing to request a new one.</p>
                <div className="space-y-3">
                  <div>
                    <input
                      list="packet-request-companies"
                      value={form.company}
                      onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                      placeholder="Company"
                      className="w-full rounded-xl border border-edge bg-panel2 px-3 py-2 text-sm text-text placeholder:text-mute/60 focus:border-acad focus:outline-none"
                    />
                    <datalist id="packet-request-companies">
                      {companies.map(c => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                  <div>
                    <input
                      list="packet-request-roles"
                      value={form.role}
                      onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                      placeholder="Role"
                      className="w-full rounded-xl border border-edge bg-panel2 px-3 py-2 text-sm text-text placeholder:text-mute/60 focus:border-acad focus:outline-none"
                    />
                    <datalist id="packet-request-roles">
                      {roles.map(r => <option key={r} value={r} />)}
                    </datalist>
                  </div>
                </div>
                {error && <div className="mt-3 text-sm text-devops">{error}</div>}
                <div className="mt-5 flex justify-end gap-2">
                  <button onClick={close} className="rounded-xl px-4 py-2 text-sm text-mute hover:text-text">Cancel</button>
                  <button
                    onClick={submit}
                    disabled={submitting}
                    className="rounded-xl bg-text px-4 py-2 text-sm font-medium text-ink disabled:opacity-50"
                  >{submitting ? "Checking…" : "Submit"}</button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { supabaseBrowser } from "@/lib/supabase-browser";
import ScalerLogo from "@/components/ScalerLogo";
import InteractiveConfetti from "@/components/InteractiveConfetti";

const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] as const },
});

const HIRING_PARTNERS = [
  "Google", "Amazon", "Salesforce", "Fractal.ai", "Sarvam.ai", "Citibank",
  "Razorpay", "Deloitte", "Flipkart", "Pine Labs", "Media.net", "Freecharge",
  "NTT Data", "Techmojo", "Kotak Mahindra Bank", "Thinkify Labs", "Lenskart", "Ethara.AI",
];

function LogoMarquee() {
  return (
    <div className="relative mx-auto mb-6 w-full max-w-3xl overflow-hidden rounded-2xl border border-edge bg-panel py-5 shadow-card">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-panel to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-panel to-transparent" />
      <div className="flex w-max animate-marquee items-center gap-12 whitespace-nowrap">
        {[...HIRING_PARTNERS, ...HIRING_PARTNERS].map((name, i) => (
          <span key={i} className="font-display text-lg tracking-wide text-mute/80">
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const params = useSearchParams();
  const next = params.get("next");
  const notAllowed = params.get("error") === "not_allowed";
  const [signingIn, setSigningIn] = useState(false);

  const signIn = async () => {
    setSigningIn(true);
    const sb = supabaseBrowser();
    const callback = new URL("/auth/callback", location.origin);
    if (next) callback.searchParams.set("next", next);
    await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString() },
    });
  };
  return (
    <div className="relative flex min-h-[70vh] flex-col items-center justify-center">
      <InteractiveConfetti />
      <div className="relative mx-auto flex max-w-md flex-col items-center text-center">
        <motion.div {...fadeUp(0)}>
          <ScalerLogo className="mb-8 h-7 w-auto text-text" />
        </motion.div>
        <motion.h1 {...fadeUp(0.08)} className="mb-3 font-display text-4xl leading-tight">
          Real questions.<br />From real Scaler learners.
        </motion.h1>
        <motion.p {...fadeUp(0.16)} className="mb-8 text-mute">Sign in with Google to browse the vault.</motion.p>
        {notAllowed && (
          <div className="mb-6 max-w-sm rounded-xl border border-devops/40 bg-devops/10 px-4 py-3 text-sm text-devops">
            This Google account isn&apos;t on the Scaler learner list, so it can&apos;t sign in here.
            If this looks wrong, reach out to <span className="font-medium">ankit.mishra@scaler.com</span>.
          </div>
        )}
        <motion.button
          {...fadeUp(0.24)}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={signIn}
          disabled={signingIn}
          className="inline-flex items-center gap-3 rounded-xl bg-text px-5 py-3 text-sm font-medium text-ink shadow-card transition-shadow hover:shadow-cardH disabled:opacity-70"
        >
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.9 0 7.4 1.4 10.1 3.6l7.5-7.5C36.7 1.6 30.7-1 24-1 14.6-1 6.5 4.4 2.7 12.3l8.7 6.7C13.4 13.1 18.2 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.5-.1-3-.4-4.5H24v9h12.7c-.6 3-2.4 5.5-5 7.2l7.7 6c4.5-4.2 7.1-10.3 7.1-17.7z"/><path fill="#FBBC05" d="M11.4 28.9c-.6-1.7-.9-3.5-.9-5.4s.3-3.7.9-5.4l-8.7-6.7C1 15.2 0 19.5 0 24s1 8.8 2.7 12.6l8.7-7.7z"/><path fill="#34A853" d="M24 47c6.7 0 12.3-2.2 16.4-6l-7.7-6c-2.1 1.4-4.9 2.3-8.7 2.3-5.8 0-10.6-3.6-12.6-8.7l-8.7 6.7C6.5 43.6 14.6 47 24 47z"/></svg>
          {signingIn ? "Redirecting…" : "Continue with Google"}
        </motion.button>
        <motion.p {...fadeUp(0.32)} className="mt-6 font-mono text-[11px] uppercase tracking-widest text-mute">Get Set Prepare</motion.p>
      </div>
      <div className="mt-10 w-full">
        <LogoMarquee />
      </div>
    </div>
  );
}

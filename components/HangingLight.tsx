"use client";
import { motion } from "framer-motion";

/**
 * Wraps content (the wordmark) with a small pendant light on a cord that
 * swings in and settles to rest, casting a warm glow down onto it. Glow
 * intensity/blend is tuned per theme via styled-jsx so it reads as a soft
 * highlight on light backgrounds and a real glow on dark ones.
 */
export default function HangingLight({ children }: { children: React.ReactNode }) {
  return (
    <div className="hanging-light relative flex flex-col items-center">
      <motion.div
        className="relative z-10 origin-top"
        initial={{ rotate: -14 }}
        animate={{ rotate: 0 }}
        transition={{ type: "spring", stiffness: 50, damping: 5.5, delay: 0.1 }}
      >
        <div className="mx-auto h-9 w-px bg-gradient-to-b from-transparent via-edge to-mute/60" />
        <div className="glow-bulb relative mx-auto h-[7px] w-[7px] rounded-full">
          <span className="glow-halo pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
      </motion.div>
      <div className="glow-spill pointer-events-none absolute left-1/2 top-8 -translate-x-1/2" />
      <div className="relative">{children}</div>
      <style jsx>{`
        .glow-bulb {
          background: radial-gradient(circle at 35% 35%, #fff8e6, #ffd66b 55%, #e2a53a 100%);
          box-shadow:
            0 0 6px 1px rgba(255, 214, 120, 0.9),
            0 0 16px 4px rgba(255, 190, 90, 0.5);
        }
        .glow-halo {
          width: 60px;
          height: 60px;
          border-radius: 9999px;
          background: radial-gradient(circle, rgba(255, 214, 120, 0.55) 0%, rgba(255, 214, 120, 0) 70%);
          filter: blur(2px);
        }
        .glow-spill {
          width: 240px;
          height: 90px;
          background: radial-gradient(ellipse at top, rgba(255, 214, 120, 0.22) 0%, rgba(255, 214, 120, 0) 72%);
          mix-blend-mode: screen;
        }
        @media (prefers-color-scheme: light) {
          :global(:root:not([data-theme="dark"])) .glow-halo {
            background: radial-gradient(circle, rgba(255, 178, 84, 0.4) 0%, rgba(255, 178, 84, 0) 70%);
          }
          :global(:root:not([data-theme="dark"])) .glow-spill {
            opacity: 0.6;
            mix-blend-mode: multiply;
            background: radial-gradient(ellipse at top, rgba(255, 178, 84, 0.3) 0%, rgba(255, 178, 84, 0) 72%);
          }
        }
        :global(:root[data-theme="light"]) .glow-halo {
          background: radial-gradient(circle, rgba(255, 178, 84, 0.4) 0%, rgba(255, 178, 84, 0) 70%);
        }
        :global(:root[data-theme="light"]) .glow-spill {
          opacity: 0.6;
          mix-blend-mode: multiply;
          background: radial-gradient(ellipse at top, rgba(255, 178, 84, 0.3) 0%, rgba(255, 178, 84, 0) 72%);
        }
      `}</style>
    </div>
  );
}

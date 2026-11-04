"use client";
import { MotionConfig } from "framer-motion";

// globals.css already switches off CSS animations for people whose device
// asks for reduced motion; this does the same for framer-motion's JS-driven
// ones (card entrances, hover lifts, the nav pill), which that CSS rule
// can't reach.
export default function MotionPrefs({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

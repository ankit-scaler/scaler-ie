"use client";
import { useEffect } from "react";

// Packet content (a mirrored Google Doc) is authored assuming a light,
// paper-like background — dark mode makes it hard to read. Forces the site
// theme to light for as long as a packet is open, then restores whatever
// the visitor had before as soon as they navigate away.
export default function ForceLightTheme() {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-theme");
    root.setAttribute("data-theme", "light");
    return () => {
      if (previous) root.setAttribute("data-theme", previous);
      else root.removeAttribute("data-theme");
    };
  }, []);
  return null;
}

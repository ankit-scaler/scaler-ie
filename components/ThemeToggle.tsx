"use client";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light" | null>(null);

  useEffect(() => {
    setTheme((document.documentElement.getAttribute("data-theme") as "dark" | "light") || "dark");
  }, []);

  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    setTheme(next);
  };

  if (!theme) return <span className="h-8 w-8" aria-hidden />;

  return (
    <button
      onClick={toggle}
      aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      className="grid h-8 w-8 place-items-center rounded-full border border-edge text-mute transition hover:text-text"
    >
      {theme === "light" ? (
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm0 4a4 4 0 100 8 4 4 0 000-8zm7 3a1 1 0 110 2h-1a1 1 0 110-2h1zM4 9a1 1 0 110 2H3a1 1 0 110-2h1zm11.657-4.243a1 1 0 010 1.415l-.707.707a1 1 0 11-1.414-1.415l.707-.707a1 1 0 011.414 0zM6.464 13.536a1 1 0 010 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zm9.193 1.414a1 1 0 01-1.414 1.414l-.707-.707a1 1 0 111.414-1.414l.707.707zM5.757 5.879a1 1 0 01-1.414-1.415l.707-.707A1 1 0 116.464 5.17l-.707.708zM10 16a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1z" />
        </svg>
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
        </svg>
      )}
    </button>
  );
}

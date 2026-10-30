"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { supabaseBrowser } from "@/lib/supabase-browser";
import ThemeToggle from "./ThemeToggle";
import ScalerLogo from "./ScalerLogo";

export default function Header() {
  const [email, setEmail]   = useState<string | null>(null);
  const [isAdmin, setAdmin] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const path = usePathname();
  const router = useRouter();
  const sb = supabaseBrowser();
  // A packet reader page forces light mode for readability (see
  // ForceLightTheme) — hide the toggle there instead of showing a control
  // that would silently get overridden.
  const isPacketOpen = /^\/packets\/[^/]+/.test(path || "");

  useEffect(() => {
    const applyUser = async (e: string | null) => {
      setEmail(e);
      if (e) {
        const r = await fetch("/api/admin/stats?check=1");
        setAdmin(r.ok);
      } else {
        setAdmin(false);
      }
    };

    sb.auth.getUser().then(({ data }) => applyUser(data.user?.email ?? null));

    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setAccountMenuOpen(false); };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountMenuOpen]);

  const tab = (href: string, label: string, opts: { external?: boolean; highlight?: boolean } = {}) => {
    const { external = false, highlight = false } = opts;
    const active = !external && path === href;
    return (
      <Link
        href={href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className={`group relative whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition-colors duration-200 ${
          highlight
            ? active
              ? "border border-acad bg-acad/15 font-semibold text-acad"
              : "border border-acad/40 bg-ink text-acad hover:border-acad/70 hover:bg-acad/15 hover:font-semibold"
            : active ? "text-text" : "text-mute hover:text-text"
        }`}
      >
        {!highlight && (active ? (
          <motion.span
            layoutId="nav-active-pill"
            className="absolute inset-0 rounded-full border border-edge bg-panel2"
            transition={{ type: "spring", stiffness: 500, damping: 42 }}
          />
        ) : (
          <span className="absolute inset-0 rounded-full bg-panel2 opacity-0 ring-1 ring-inset ring-edge-strong transition-opacity duration-200 group-hover:opacity-100" />
        ))}
        <span className="relative z-10">{label}</span>
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-40 border-b border-edge/60 bg-ink/70 backdrop-blur-xl">
      <div className="mx-auto flex w-full items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 transition-opacity duration-200 hover:opacity-80">
          <ScalerLogo className="h-6 w-auto text-text" />
          <span className="hidden font-display text-xl leading-none sm:inline">Interview Vault</span>
          <span className="relative hidden h-2 w-2 sm:inline-flex" title="Live">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
        </Link>
        {email && (
          <nav className="flex min-w-0 flex-1 items-center justify-center gap-2 overflow-x-auto sm:overflow-visible">
            {tab("/", "Questions")}
            {tab("/assignments", "Assignments")}
            {tab("/packets", "Prepare for Trending roles")}
            {tab("/company-packets", "Packets")}
            <span className="mx-1 h-5 w-px shrink-0 self-center bg-edge" aria-hidden />
            {tab("/jobs", "Open Hirings", { highlight: true })}
            {tab("https://cortex-by-scaler.up.railway.app/login", "Revise with Crash Course", { external: true, highlight: true })}
          </nav>
        )}
        <div className="flex shrink-0 items-center gap-3">
          {!isPacketOpen && <ThemeToggle />}
          {email ? (
            <>
              {!isAdmin && <span className="hidden text-sm text-mute sm:inline">{email}</span>}
              <motion.button
                onClick={async () => {
                  setSigningOut(true);
                  await sb.auth.signOut();
                  router.push("/login");
                }}
                disabled={signingOut}
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.1 }}
                className="rounded-full border border-edge px-3 py-1.5 text-sm text-mute transition-colors duration-200 hover:border-text/40 hover:bg-panel2 hover:text-text disabled:opacity-50"
              >{signingOut ? "Signing out…" : "Sign out"}</motion.button>
              {isAdmin && (
                <div className="relative" ref={accountMenuRef}>
                  <button
                    onClick={() => setAccountMenuOpen(v => !v)}
                    className="hidden items-center gap-1.5 rounded-full border border-transparent px-2 py-1 text-sm text-mute transition-colors duration-200 hover:border-edge hover:text-text sm:flex"
                  >
                    {email}
                    <svg
                      className={`h-3.5 w-3.5 transition-transform duration-200 ${accountMenuOpen ? "rotate-180" : ""}`}
                      viewBox="0 0 20 20" fill="currentColor"
                    ><path d="M5.5 7.5l4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                  {accountMenuOpen && (
                    <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-edge bg-panel shadow-card divide-y divide-edge/60">
                      <Link
                        href="/admin/tracking"
                        onClick={() => setAccountMenuOpen(false)}
                        className="block px-4 py-2.5 text-sm text-text transition-colors hover:bg-panel2"
                      >Tracking</Link>
                      <Link
                        href="/admin/access"
                        onClick={() => setAccountMenuOpen(false)}
                        className="block px-4 py-2.5 text-sm text-text transition-colors hover:bg-panel2"
                      >Access management</Link>
                      <Link
                        href="/admin/content"
                        onClick={() => setAccountMenuOpen(false)}
                        className="block px-4 py-2.5 text-sm text-text transition-colors hover:bg-panel2"
                      >Content management</Link>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <motion.button
              onClick={async () => {
                const callback = new URL("/auth/callback", location.origin);
                if (path && path !== "/login") callback.searchParams.set("next", path);
                await sb.auth.signInWithOAuth({
                  provider: "google",
                  options: { redirectTo: callback.toString() },
                });
              }}
              whileTap={{ scale: 0.96 }}
              transition={{ duration: 0.1 }}
              className="rounded-full bg-text px-3 py-1.5 text-sm font-medium text-ink transition-opacity duration-200 hover:opacity-90"
            >
              Sign in
            </motion.button>
          )}
        </div>
      </div>
    </header>
  );
}

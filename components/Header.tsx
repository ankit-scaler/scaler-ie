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
  const [navOpen, setNavOpen] = useState(false);
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

  // The phone menu closes on any navigation, and on Escape.
  useEffect(() => { setNavOpen(false); setAccountMenuOpen(false); }, [path]);
  useEffect(() => {
    if (!navOpen) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setNavOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [navOpen]);

  const signOut = async () => {
    setSigningOut(true);
    await sb.auth.signOut();
    router.push("/login");
  };

  // Company packets (/company-packets) and the role × YoE guides (/packets)
  // share one "Packets" tab; each page has a switch to the other (see
  // PacketsSwitch). Their URLs stay as they were, so old links and the
  // admin tracking keyed on them keep working.
  const TABS: { href: string; label: string; match: (p: string) => boolean }[] = [
    { href: "/",                label: "Questions",   match: p => p === "/" },
    { href: "/company-packets", label: "Packets",     match: p => p.startsWith("/company-packets") || p.startsWith("/packets") },
    { href: "/assignments",     label: "Assignments", match: p => p.startsWith("/assignments") },
  ];
  // Ankit's "Direction 1": after a divider, Open Hirings and Crash Course get
  // the featured pill treatment.
  const OPEN_HIRINGS = { href: "/jobs", label: "Open Hirings", match: (p: string) => p.startsWith("/jobs") };
  const CRASH_COURSE = "https://cortex-by-scaler.up.railway.app/login";
  const featuredPill = (active: boolean) =>
    `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition-colors duration-200 ${
      active
        ? "border border-acad bg-acad/15 font-semibold text-acad"
        : "border border-acad/40 bg-ink text-acad hover:border-acad/70 hover:bg-acad/15 hover:font-semibold"
    }`;

  const ExternalIcon = () => (
    <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden><path d="M7 3h10v10h-2V6.4L4.7 16.7 3.3 15.3 13.6 5H7V3z"/></svg>
  );

  const tab = (href: string, label: string, active: boolean) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? "page" : undefined}
      className={`group relative whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition-colors duration-200 ${
        active ? "text-text" : "text-mute hover:text-text"
      }`}
    >
      {active ? (
        <motion.span
          layoutId="nav-active-pill"
          className="absolute inset-0 rounded-full border border-edge bg-panel2"
          transition={{ type: "spring", stiffness: 500, damping: 42 }}
        />
      ) : (
        <span className="absolute inset-0 rounded-full bg-panel2 opacity-0 ring-1 ring-inset ring-edge-strong transition-opacity duration-200 group-hover:opacity-100" />
      )}
      <span className="relative z-10">{label}</span>
    </Link>
  );

  const menuItem = "block px-4 py-2.5 text-sm text-text transition-colors hover:bg-panel2";

  return (
    <header className="sticky top-0 z-40 border-b border-edge/60 bg-ink/70 backdrop-blur-xl">
      <div className="mx-auto flex w-full items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex shrink-0 items-center gap-2">
          {email && (
            <button
              onClick={() => setNavOpen(v => !v)}
              aria-expanded={navOpen}
              aria-controls="mobile-nav"
              aria-label={navOpen ? "Close menu" : "Open menu"}
              className="-ml-1 rounded-lg p-1.5 text-mute transition-colors hover:bg-panel2 hover:text-text md:hidden"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                {navOpen ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3.5 6h13M3.5 10h13M3.5 14h13" />}
              </svg>
            </button>
          )}
          <Link href="/" className="flex items-center gap-2 transition-opacity duration-200 hover:opacity-80">
            <ScalerLogo className="h-6 w-auto text-text" />
            <span className="hidden font-display text-xl leading-none sm:inline">Interview Vault</span>
          </Link>
        </div>

        {email && (
          <nav aria-label="Main" className="hidden min-w-0 flex-1 items-center justify-center gap-2 md:flex">
            {TABS.map(t => tab(t.href, t.label, t.match(path || "")))}
            <span className="mx-1 h-5 w-px shrink-0 self-center bg-edge" aria-hidden />
            <Link
              href={OPEN_HIRINGS.href}
              aria-current={OPEN_HIRINGS.match(path || "") ? "page" : undefined}
              className={featuredPill(OPEN_HIRINGS.match(path || ""))}
            >{OPEN_HIRINGS.label}</Link>
            <a
              href={CRASH_COURSE}
              target="_blank" rel="noopener noreferrer"
              className={featuredPill(false)}
            >Revise with Crash Course <ExternalIcon /></a>
          </nav>
        )}

        <div className="flex shrink-0 items-center gap-2">
          {!isPacketOpen && <ThemeToggle />}
          {email ? (
            <div className="relative" ref={accountMenuRef}>
              <button
                onClick={() => setAccountMenuOpen(v => !v)}
                aria-expanded={accountMenuOpen}
                aria-haspopup="menu"
                aria-label="Account menu"
                className="flex items-center gap-1.5 rounded-full border border-edge py-1 pl-1 pr-2 text-sm text-mute transition-colors duration-200 hover:border-text/40 hover:text-text"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-panel2 font-medium uppercase text-text">{email[0]}</span>
                <svg
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${accountMenuOpen ? "rotate-180" : ""}`}
                  viewBox="0 0 20 20" fill="none" aria-hidden
                ><path d="M5.5 7.5l4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              {accountMenuOpen && (
                <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-edge bg-panel shadow-card divide-y divide-edge/60">
                  <div className="truncate px-4 py-2.5 text-xs text-mute" title={email}>{email}</div>
                  {isAdmin && (
                    <div>
                      <Link role="menuitem" href="/admin/tracking" className={menuItem}>Tracking</Link>
                      <Link role="menuitem" href="/admin/access" className={menuItem}>Access management</Link>
                      <Link role="menuitem" href="/admin/content" className={menuItem}>Content management</Link>
                    </div>
                  )}
                  <button
                    role="menuitem"
                    onClick={signOut}
                    disabled={signingOut}
                    className={`${menuItem} w-full text-left disabled:opacity-50`}
                  >{signingOut ? "Signing out…" : "Sign out"}</button>
                </div>
              )}
            </div>
          ) : path !== "/login" && (
            // The login page has its own "Continue with Google" button —
            // a second Sign in here would be two buttons doing one thing.
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

      {email && navOpen && (
        <nav id="mobile-nav" aria-label="Main" className="border-t border-edge/60 bg-ink px-4 pb-4 pt-2 md:hidden">
          {TABS.map(t => {
            const active = t.match(path || "");
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`block rounded-xl px-3 py-2.5 text-base ${active ? "bg-panel2 text-text" : "text-mute hover:text-text"}`}
              >{t.label}</Link>
            );
          })}
          <div className="my-2 h-px bg-edge" aria-hidden />
          <Link
            href={OPEN_HIRINGS.href}
            aria-current={OPEN_HIRINGS.match(path || "") ? "page" : undefined}
            className={`block rounded-xl px-3 py-2.5 text-base ${OPEN_HIRINGS.match(path || "") ? "bg-acad/15 font-semibold text-acad" : "text-acad"}`}
          >{OPEN_HIRINGS.label}</Link>
          <a
            href={CRASH_COURSE}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-base text-acad"
          >Revise with Crash Course <ExternalIcon /></a>
        </nav>
      )}
    </header>
  );
}

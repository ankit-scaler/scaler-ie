"use client";
import LoadingLink from "./LoadingLink";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { supabaseBrowser } from "@/lib/supabase-browser";
import ThemeToggle from "./ThemeToggle";
import ScalerLogo from "./ScalerLogo";

const ICON = {
  q: <path d="M4 5h12v8H9l-4 3v-3H4z" />,
  a: <><rect x="4" y="3" width="12" height="14" rx="2" /><path d="M7 8h6M7 11h4" /></>,
  p: <path d="M3 14l5-5 3 3 6-7" />,
  k: <path d="M4 4h8a3 3 0 013 3v9H7a3 3 0 01-3-3z" />,
  j: <><rect x="3" y="6" width="14" height="10" rx="2" /><path d="M7 6V4h6v2" /></>,
  r: <path d="M5 10a5 5 0 119 3M14 16v-3h-3" />,
};
const Icon = ({ k }: { k: keyof typeof ICON }) => (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{ICON[k]}</svg>
);
const MAIN_TABS: { href: string; label: string; icon: keyof typeof ICON }[] = [
  { href: "/", label: "Questions", icon: "q" },
  { href: "/assignments", label: "Assignments", icon: "a" },
  { href: "/packets", label: "Prepare for Trending roles", icon: "p" },
  { href: "/company-packets", label: "Packets", icon: "k" },
];
const CORTEX_URL = "https://cortex-by-scaler.up.railway.app/login";

// Admin check once per visit, not on every page load: each check is a Vercel
// function call. The answer is kept for this tab's session (sessionStorage),
// keyed by email so switching accounts re-checks. Only a definite yes/no
// (200 or 401/403) is kept; a network or server error is retried next time.
// Someone made admin mid-visit sees the admin links after opening a new tab.
let adminCheck: { email: string; p: Promise<boolean> } | null = null;
function isAdminOnce(email: string): Promise<boolean> {
  const key = `vault-admin:${email.toLowerCase()}`;
  try {
    const kept = sessionStorage.getItem(key);
    if (kept === "1" || kept === "0") return Promise.resolve(kept === "1");
  } catch {}
  if (adminCheck?.email === email) return adminCheck.p;  // getUser and onAuthStateChange both fire on load
  const p = fetch("/api/admin/stats?check=1")
    .then(r => {
      if (r.ok || r.status === 401 || r.status === 403) {
        try { sessionStorage.setItem(key, r.ok ? "1" : "0"); } catch {}
      } else adminCheck = null;
      return r.ok;
    })
    .catch(() => { adminCheck = null; return false; });
  adminCheck = { email, p };
  return p;
}

export default function Header() {
  const [email, setEmail]   = useState<string | null>(null);
  const [isAdmin, setAdmin] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const [navMenuOpen, setNavMenuOpen] = useState(false);
  const navMenuRef = useRef<HTMLDivElement>(null);
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
        setAdmin(await isAdminOnce(e));
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

  // Narrow-screen nav menu: closes on outside click, Escape and route change.
  useEffect(() => { setNavMenuOpen(false); }, [path]);
  useEffect(() => {
    if (!navMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (navMenuRef.current && !navMenuRef.current.contains(e.target as Node)) setNavMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setNavMenuOpen(false); };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [navMenuOpen]);

  const tab = (href: string, label: string, opts: { external?: boolean; highlight?: boolean; icon?: keyof typeof ICON } = {}) => {
    const { external = false, highlight = false, icon } = opts;
    const active = !external && path === href;
    return (
      <LoadingLink
        href={href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className={`group relative inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors duration-200 ${
          highlight
            ? active
              ? "border border-acad bg-acad/15 font-semibold text-acad"
              : "border border-acad/40 bg-ink text-acad hover:border-acad/70 hover:bg-acad/15"
            : active ? "font-semibold text-text" : "text-mute hover:text-text"
        }`}
      >
        {!highlight && active && (
          <motion.span
            layoutId="nav-active-pill"
            className="absolute inset-0 rounded-full bg-panel shadow-sm ring-1 ring-edge/60"
            transition={{ type: "spring", stiffness: 500, damping: 42 }}
          />
        )}
        {icon && <span className="relative z-10"><Icon k={icon} /></span>}
        <span className="relative z-10">{label}</span>
      </LoadingLink>
    );
  };

  return (
    <header className="sticky top-0 z-40 border-b border-edge/60 bg-ink/70 backdrop-blur-xl">
      <div className="mx-auto flex w-full items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <LoadingLink href="/" className="flex shrink-0 items-center gap-2 transition-opacity duration-200 hover:opacity-80">
          <ScalerLogo className="h-6 w-auto text-text" />
          <span className="hidden font-display text-xl leading-none sm:inline">Interview Vault</span>
          <span className="relative hidden h-2 w-2 sm:inline-flex" title="Live">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
        </LoadingLink>
        {email && (
          <>
            {/* ≥1440px: full nav, never scrolls (sized to fit with room to spare). */}
            <nav className="hidden min-w-0 flex-1 items-center justify-start gap-2 min-[1440px]:flex">
              <div className="flex items-center gap-0.5 rounded-full bg-panel2 p-1">
                {MAIN_TABS.map(t => tab(t.href, t.label, { icon: t.icon }))}
              </div>
              {tab("/jobs", "Open Hirings", { highlight: true })}
              {tab(CORTEX_URL, "Revise with Crash Course", { external: true, highlight: true })}
            </nav>
            {/* Narrower screens: one Menu button instead of a scrolling strip. */}
            <div className="relative min-w-0 flex-1 min-[1440px]:hidden" ref={navMenuRef}>
              <button
                onClick={() => setNavMenuOpen(v => !v)}
                aria-expanded={navMenuOpen}
                aria-haspopup="menu"
                className="inline-flex items-center gap-2 rounded-full border border-edge bg-panel2 px-4 py-1.5 text-sm font-medium text-text transition-colors hover:border-text/40"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                  <path d="M4 6h12M4 10h12M4 14h12" />
                </svg>
                Menu
              </button>
              {navMenuOpen && (
                <div role="menu" className="absolute left-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-edge bg-panel p-1.5 shadow-card">
                  {[...MAIN_TABS, { href: "/jobs", label: "Open Hirings", icon: "j" as const }, { href: CORTEX_URL, label: "Revise with Crash Course", icon: "r" as const }].map(t => {
                    const external = t.href.startsWith("http");
                    const active = !external && path === t.href;
                    return (
                      <LoadingLink
                        key={t.href}
                        href={t.href}
                        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                          active ? "bg-panel2 font-semibold text-text" : "text-mute hover:bg-panel2 hover:text-text"
                        }`}
                      >
                        <Icon k={t.icon} />{t.label}
                      </LoadingLink>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
        <div className="flex shrink-0 items-center gap-3">
          {!isPacketOpen && <ThemeToggle />}
          {email ? (
            <>
              <motion.button
                onClick={async () => {
                  setSigningOut(true);
                  await sb.auth.signOut();
                  router.push("/login");
                }}
                disabled={signingOut}
                title={signingOut ? "Signing out…" : "Sign out"}
                aria-label="Sign out"
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.1 }}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-edge text-mute transition-colors duration-200 hover:border-text/40 hover:bg-panel2 hover:text-text disabled:opacity-50"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none">
                  <path d="M8 3H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M13 13.5l3.5-3.5L13 6.5M7 10h9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </motion.button>
              <div className="relative" ref={accountMenuRef}>
                <button
                  onClick={() => setAccountMenuOpen(v => !v)}
                  title={email}
                  aria-label="Account"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-edge text-mute transition-colors duration-200 hover:border-text/40 hover:bg-panel2 hover:text-text"
                >
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none">
                    <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M4 17c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <path d="M5.8 5.3a2.3 2.3 0 1 0 .3 4.5M14.2 5.3a2.3 2.3 0 1 1-.3 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    <path d="M1.8 16c.3-2 2-3.3 4-3.5M18.2 16c-.3-2-2-3.3-4-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                </button>
                {accountMenuOpen && (
                  <div className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-edge bg-panel shadow-card">
                    <div className="truncate px-4 py-2.5 font-mono text-xs text-mute">{email}</div>
                    {isAdmin && (
                      <div className="divide-y divide-edge/60 border-t border-edge/60">
                        <LoadingLink
                          href="/admin/tracking"
                          onClick={() => setAccountMenuOpen(false)}
                          className="block px-4 py-2.5 text-sm text-text transition-colors hover:bg-panel2"
                        >Tracking</LoadingLink>
                        <LoadingLink
                          href="/admin/access"
                          onClick={() => setAccountMenuOpen(false)}
                          className="block px-4 py-2.5 text-sm text-text transition-colors hover:bg-panel2"
                        >Access management</LoadingLink>
                        <LoadingLink
                          href="/admin/content"
                          onClick={() => setAccountMenuOpen(false)}
                          className="block px-4 py-2.5 text-sm text-text transition-colors hover:bg-panel2"
                        >Content management</LoadingLink>
                      </div>
                    )}
                  </div>
                )}
              </div>
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

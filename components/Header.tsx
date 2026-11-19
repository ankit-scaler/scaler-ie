"use client";
import LoadingLink from "./LoadingLink";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { supabaseBrowser } from "@/lib/supabase-browser";
import ThemeToggle from "./ThemeToggle";
import { readAdminCache, writeAdminCache } from "@/lib/admin-cache";

const ICON = {
  q: <path d="M4 5h12v8H9l-4 3v-3H4z" />,
  a: <><rect x="4" y="3" width="12" height="14" rx="2" /><path d="M7 8h6M7 11h4" /></>,
  p: <path d="M3 14l5-5 3 3 6-7" />,
  k: <path d="M4 4h8a3 3 0 013 3v9H7a3 3 0 01-3-3z" />,
  j: <><rect x="3" y="6" width="14" height="10" rx="2" /><path d="M7 6V4h6v2" /></>,
  r: <path d="M5 10a5 5 0 119 3M14 16v-3h-3" />,
  f: <><path d="M6 3h5l4 4v10H6z" /><path d="M11 3v4h4M8.5 11h4M8.5 14h4" /></>,
  x: <path d="M7 3h10v10M17 3L5 15" />,
};
const Icon = ({ k }: { k: keyof typeof ICON }) => (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{ICON[k]}</svg>
);
const CORTEX_URL = "https://cortex-by-scaler.up.railway.app/login";
// Model resumes list (app/resumes). Change this one constant if the route moves.
const RESUME_HREF = "/resumes";

type NavItem = {
  href: string; label: string; hint: string; icon: keyof typeof ICON;
  short?: string;      // shorter label for the pill; `label` stays as tooltip + menu text
  isNew?: boolean; external?: boolean;
  img?: string;        // image icon instead of the line icon
  live?: boolean;      // blinking red dot: "live openings"
};
// Two groups: Learn (the prep pages) and Career (getting the job).
const LEARN_TABS: NavItem[] = [
  { href: "/", label: "Questions", hint: "Real interview questions", icon: "q" },
  { href: "/assignments", label: "Assignments", hint: "Take-home tasks by company", icon: "a" },
  { href: "/packets", label: "Prepare for Trending roles", short: "Trending roles", hint: "Role-wise prep packets", icon: "p" },
  { href: "/company-packets", label: "Packets", hint: "Company interview packets", icon: "k" },
];
const JOBS_ITEM: NavItem = { href: "/jobs", label: "Open Hirings", short: "Hiring", hint: "Live job openings", icon: "j", img: "/icons/hiring.png", live: true };
const CAREER_TABS: NavItem[] = [
  { href: RESUME_HREF, label: "Resumes", hint: "Model resumes, annotated", icon: "f", isNew: true },
  JOBS_ITEM,
];
const CORTEX_ITEM: NavItem = { href: CORTEX_URL, label: "Revise with Crash Course", short: "Crash Course", hint: "Opens in a new tab", icon: "r", external: true };

const NewTag = () => (
  <span className="relative z-10 rounded-full bg-acad px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase leading-none tracking-wider text-ink">New</span>
);
// The only blinking dot in the bar: Hiring has live openings.
const LiveDot = () => (
  <span className="relative z-10 inline-flex h-2 w-2" title="Live openings" aria-hidden>
    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
  </span>
);
const NavIcon = ({ item, size = "h-4 w-4" }: { item: NavItem; size?: string }) =>
  item.img
    ? <img src={item.img} alt="" width={20} height={20} className={`${size === "h-4 w-4" ? "h-5 w-5" : size} shrink-0`} />
    : <Icon k={item.icon} />;

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
    // Supabase fires several auth events per page load (initial session, signed
    // in, hourly token refresh) and the email almost never changes between
    // them. Only act when it does; before, each event re-ran the admin check
    // (3 calls to /api/admin/stats in one page load in the network log).
    let lastApplied: string | null | undefined;
    const applyUser = async (e: string | null) => {
      if (e === lastApplied) return;
      lastApplied = e;
      setEmail(e);
      if (e) {
        // Remembered for an hour per browser session: no server call on every
        // page load. Only definite answers are stored (200 admin / 403 not).
        const store = (() => { try { return window.sessionStorage; } catch { return null; } })();
        const cached = readAdminCache(store, e, Date.now());
        if (cached !== null) { setAdmin(cached); return; }
        const r = await fetch("/api/admin/stats?check=1").catch(() => null);
        if (lastApplied !== e) return; // the user changed (e.g. signed out) while we waited: drop this stale answer
        setAdmin(!!r?.ok);
        if (r && (r.ok || r.status === 403)) writeAdminCache(store, e, r.ok, Date.now());
        else lastApplied = undefined; // no definite answer (network/server error): allow a retry on the next auth event
      } else {
        setAdmin(false);
      }
    };

    // Local session (no network). getUser() made a call to Supabase Auth on
    // every page load just to read the email; this is display-only, and every
    // server route still verifies the login itself.
    sb.auth.getSession().then(({ data }) => applyUser(data.session?.user?.email ?? null));

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

  const tab = (item: NavItem, opts: { highlight?: boolean } = {}) => {
    const { highlight = false } = opts;
    const external = !!item.external;
    const active = !external && path === item.href;
    return (
      <LoadingLink
        key={item.href}
        href={item.href}
        title={item.label}
        aria-current={active ? "page" : undefined}
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
        {!highlight && <span className="relative z-10"><NavIcon item={item} /></span>}
        <span className="relative z-10">{item.short || item.label}</span>
        {item.isNew && <NewTag />}
        {item.live && <LiveDot />}
        {external && highlight && <span className="relative z-10"><Icon k="x" /></span>}
      </LoadingLink>
    );
  };

  return (
    <header className="sticky top-0 z-40 border-b border-edge/60 bg-ink/70 backdrop-blur-xl">
      <div className="mx-auto flex w-full items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <LoadingLink href="/" className="flex shrink-0 items-center gap-2 transition-opacity duration-200 hover:opacity-80">
          <img src="/icons/scaler-academy.png" alt="Scaler" width={32} height={32} className="h-8 w-8" />
          <span className="hidden font-display text-xl leading-none sm:inline">Interview Vault</span>
        </LoadingLink>
        {email && (
          <>
            {/* ≥1360px: two floating pills centered in the bar (Learn | Career), never
                scrolls. Crash Course sits in the right-hand cluster. */}
            <nav aria-label="Main" className="hidden min-w-0 flex-1 items-center justify-center gap-2 min-[1360px]:flex">
              <div className="flex items-center gap-0.5 rounded-full border border-edge/60 bg-panel2 p-1 shadow-card">
                {LEARN_TABS.map(t => tab(t))}
              </div>
              <div className="flex items-center gap-0.5 rounded-full border border-edge/60 bg-panel2 p-1 shadow-card">
                {CAREER_TABS.map(t => tab(t))}
              </div>
            </nav>
            {/* Narrower screens: one Menu button instead of a scrolling strip. */}
            <div className="relative min-w-0 flex-1 min-[1360px]:hidden" ref={navMenuRef}>
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
                <div role="menu" className="absolute left-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-edge bg-panel p-1.5 shadow-card">
                  {[...LEARN_TABS, ...CAREER_TABS, CORTEX_ITEM].map(t => {
                    const external = !!t.external;
                    const active = !external && path === t.href;
                    return (
                      <LoadingLink
                        key={t.href}
                        href={t.href}
                        role="menuitem"
                        aria-current={active ? "page" : undefined}
                        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                          active ? "bg-panel2 font-semibold text-text" : "text-mute hover:bg-panel2 hover:text-text"
                        }`}
                      >
                        <NavIcon item={t} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">{t.label}{t.isNew && <NewTag />}{t.live && <LiveDot />}</span>
                          <span className="block text-xs font-normal text-mute">{t.hint}</span>
                        </span>
                        {external && <Icon k="x" />}
                      </LoadingLink>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
        <div className="flex shrink-0 items-center gap-3">
          {email && <div className="hidden min-[1360px]:block">{tab(CORTEX_ITEM, { highlight: true })}</div>}
          {/* Below 1360px the pills fold into Menu; Hiring stays one tap away. */}
          {email && (
            <LoadingLink
              href={JOBS_ITEM.href}
              title={JOBS_ITEM.label}
              aria-label={JOBS_ITEM.label}
              aria-current={path === JOBS_ITEM.href ? "page" : undefined}
              className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-sm font-medium transition-colors duration-200 min-[1360px]:hidden ${
                path === JOBS_ITEM.href ? "border-acad bg-acad/15 text-text" : "border-acad/40 bg-ink text-text hover:border-acad/70 hover:bg-acad/15"
              }`}
            >
              <img src={JOBS_ITEM.img} alt="" width={20} height={20} className="h-5 w-5" />
              <span className="hidden sm:inline">{JOBS_ITEM.short}</span>
              <LiveDot />
            </LoadingLink>
          )}
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

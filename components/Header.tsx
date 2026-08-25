"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabaseBrowser } from "@/lib/supabase-browser";
import ThemeToggle from "./ThemeToggle";
import ScalerLogo from "./ScalerLogo";

export default function Header() {
  const [email, setEmail]   = useState<string | null>(null);
  const [isAdmin, setAdmin] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const path = usePathname();
  const router = useRouter();
  const sb = supabaseBrowser();

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

  const tab = (href: string, label: string) => {
    const active = path === href;
    return (
      <Link
        href={href}
        className={`group relative whitespace-nowrap rounded-full border border-transparent px-4 py-1.5 text-sm transition-colors ${
          active ? "text-text" : "text-mute hover:text-text"
        }`}
      >
        {active && (
          <motion.span
            layoutId="nav-active-pill"
            className="absolute inset-0 rounded-full border border-edge bg-panel2"
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          />
        )}
        <span className="relative z-10">{label}</span>
        {!active && (
          <span className="pointer-events-none absolute inset-x-4 -bottom-0.5 h-px origin-left scale-x-0 bg-text/50 transition-transform duration-300 ease-out group-hover:scale-x-100" />
        )}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-40 border-b border-edge/60 bg-ink/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="group flex items-center gap-2 transition-opacity hover:opacity-80">
          <ScalerLogo className="h-6 w-auto text-text transition-transform duration-300 group-hover:scale-105" />
          <span className="hidden font-display text-xl leading-none sm:inline">Interview Vault</span>
          <span className="relative hidden h-2 w-2 sm:inline-flex" title="Live">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
        </Link>
        {email && (
          <nav className="flex items-center gap-1 overflow-x-auto">
            {tab("/", "Questions")}
            {tab("/assignments", "Assignments")}
            {tab("/packets", "Prepare for Trending roles")}
            {isAdmin && tab("/admin", "Admin")}
          </nav>
        )}
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {email ? (
            <>
              <span className="hidden text-sm text-mute sm:inline">{email}</span>
              <motion.button
                onClick={async () => {
                  setSigningOut(true);
                  await sb.auth.signOut();
                  router.push("/login");
                }}
                disabled={signingOut}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.95 }}
                className="rounded-full border border-edge px-3 py-1.5 text-sm text-mute transition-colors hover:border-text/40 hover:bg-panel2 hover:text-text disabled:opacity-50"
              >{signingOut ? "Signing out…" : "Sign out"}</motion.button>
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
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.95 }}
              className="rounded-full bg-text px-3 py-1.5 text-sm font-medium text-ink transition-opacity hover:opacity-90"
            >
              Sign in
            </motion.button>
          )}
        </div>
      </div>
    </header>
  );
}

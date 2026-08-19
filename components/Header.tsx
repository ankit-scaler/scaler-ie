"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import ThemeToggle from "./ThemeToggle";
import ScalerLogo from "./ScalerLogo";

export default function Header() {
  const [email, setEmail]   = useState<string | null>(null);
  const [isAdmin, setAdmin] = useState(false);
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

  const tab = (href: string, label: string) => (
    <Link
      href={href}
      className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-sm transition ${
        path === href
          ? "border-edge bg-panel2 text-text"
          : "border-transparent text-mute hover:text-text"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-edge/60 bg-ink/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <ScalerLogo className="h-6 w-auto text-text" />
          <span className="hidden font-display text-xl leading-none sm:inline">Interview Vault</span>
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
              <button
                onClick={async () => { await sb.auth.signOut(); router.push("/login"); }}
                className="rounded-full border border-edge px-3 py-1.5 text-sm text-mute hover:text-text"
              >Sign out</button>
            </>
          ) : (
            <Link href="/login" className="rounded-full bg-text px-3 py-1.5 text-sm font-medium text-ink">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

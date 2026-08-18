"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
  const [email, setEmail]   = useState<string | null>(null);
  const [isAdmin, setAdmin] = useState(false);
  const path = usePathname();
  const router = useRouter();
  const sb = supabaseBrowser();

  useEffect(() => {
    sb.auth.getUser().then(async ({ data }) => {
      const e = data.user?.email ?? null;
      setEmail(e);
      if (e) {
        const r = await fetch("/api/admin/stats?check=1");
        setAdmin(r.ok);
      }
    });
  }, []);

  const tab = (href: string, label: string) => (
    <Link
      href={href}
      className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition ${
        path === href
          ? "bg-panel2 text-text shadow-card"
          : "text-mute hover:text-text"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-edge/60 bg-ink/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-acad to-dsml text-sm font-bold text-ink">S</span>
          <span className="font-display text-xl leading-none">Interview Vault</span>
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto">
          {tab("/", "Questions")}
          {tab("/assignments", "Assignments")}
          {tab("/packets", "Packets for Hirings")}
          {isAdmin && tab("/admin", "Admin")}
        </nav>
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

// Remembers, for one browser session, whether the signed-in user is an admin,
// so the header doesn't call /api/admin/stats?check=1 (a Vercel function: login
// check + admins lookup) on every single page load for every learner.
//
// This only decides whether the Admin links are SHOWN. Every admin route and
// page still checks admin rights on the server, so a tampered value here can
// show a menu item but never grant access. Pure (storage is injected) so it can
// be tested in Node.

export const ADMIN_CACHE_TTL_MS = 60 * 60_000; // 1 hour: a newly added admin sees the menu within the hour (or in a new tab session)

type Storage = { getItem(k: string): string | null; setItem(k: string, v: string): void };

export const adminCacheKey = (email: string) => `iv:admin:${email.trim().toLowerCase()}`;

// true / false = a fresh remembered answer; null = unknown, ask the server.
export function readAdminCache(storage: Storage | null, email: string, now: number): boolean | null {
  try {
    const raw = storage?.getItem(adminCacheKey(email));
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (typeof j?.v !== "boolean" || typeof j?.t !== "number") return null;
    if (j.t > now) return null;                       // clock went backwards: don't trust it
    if (now - j.t > ADMIN_CACHE_TTL_MS) return null;  // expired
    return j.v;
  } catch {
    return null;
  }
}

export function writeAdminCache(storage: Storage | null, email: string, isAdmin: boolean, now: number) {
  try {
    storage?.setItem(adminCacheKey(email), JSON.stringify({ v: isAdmin, t: now }));
  } catch {
    /* storage blocked or full: just ask the server next time */
  }
}

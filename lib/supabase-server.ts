import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export const supabaseServer = () => {
  const store = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get:    (n) => store.get(n)?.value,
        set:    (n, v, o) => { try { store.set({ name: n, value: v, ...o }); } catch {} },
        remove: (n, o)    => { try { store.set({ name: n, value: "", ...o }); } catch {} },
      },
    }
  );
};

// Service-role client for admin API routes only. Never import in client code.
export const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } }
  );

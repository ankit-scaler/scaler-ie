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
        get:    (n: string) => store.get(n)?.value,
        set:    (n: string, v: string, o: any) => { try { store.set({ name: n, value: v, ...o }); } catch {} },
        remove: (n: string, o: any) => { try { store.set({ name: n, value: "", ...o }); } catch {} },
      },
    }
  );
};

export const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } }
  );
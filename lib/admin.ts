import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";

export async function requireAdmin() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email) return null;
  const admin = supabaseAdmin();
  const { data } = await admin.from("admins").select("email").eq("email", user.email).maybeSingle();
  return data ? user.email : null;
}

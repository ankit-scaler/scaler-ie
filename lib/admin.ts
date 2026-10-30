import { redirect } from "next/navigation";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";

export async function requireAdmin() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email) return null;
  const admin = supabaseAdmin();
  const { data } = await admin.from("admins").select("email").eq("email", user.email).maybeSingle();
  return data ? user.email : null;
}

// Same gate as requireAdmin(), but for a server component page instead of
// an API route: redirects instead of returning null, so each of the three
// /admin/* pages doesn't repeat this inline.
export async function requireAdminPage() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const admin = supabaseAdmin();
  const { data } = await admin.from("admins").select("email").eq("email", user.email!).maybeSingle();
  if (!data) redirect("/");
  return user.email!;
}

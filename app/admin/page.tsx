import { redirect } from "next/navigation";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import AdminDashboard from "@/components/AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const admin = supabaseAdmin();
  const { data } = await admin.from("admins").select("email").eq("email", user.email!).maybeSingle();
  if (!data) redirect("/");
  return <AdminDashboard me={user.email!} />;
}

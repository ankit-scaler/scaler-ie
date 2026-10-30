import { requireAdminPage } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase-server";
import AdminAccess from "@/components/AdminAccess";

export const dynamic = "force-dynamic";

export default async function AdminAccessPage() {
  await requireAdminPage();
  const admin = supabaseAdmin();
  const { data } = await admin.from("admins").select("email,added_at,added_by").order("added_at", { ascending: false });
  return <AdminAccess initialAdmins={data || []} />;
}

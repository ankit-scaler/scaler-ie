import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import AssignmentsView from "@/components/AssignmentsView";

export const dynamic = "force-dynamic";

export default async function Assignments() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await sb
    .from("assignments")
    .select("id,program,company,role,round,link")
    .order("id", { ascending: false })
    .limit(2000);
  return <AssignmentsView initial={data || []} />;
}

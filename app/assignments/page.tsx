import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { fetchTableCached } from "@/lib/cached-table";
import AssignmentsView, { A } from "@/components/AssignmentsView";
import { getPacketLinks } from "@/lib/prep-data";

export const dynamic = "force-dynamic";

// Cached until the next sync or Admin edit (both bump/clear "assignments";
// see lib/cached-table.ts).
const getAllAssignments = () => fetchTableCached<A>({
  dataset: "assignments", table: "assignments", select: "id,program,company,role,round,link",
});

export default async function Assignments() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const [all, packets] = await Promise.all([getAllAssignments(), getPacketLinks()]);
  return <AssignmentsView initial={all} packets={packets} />;
}

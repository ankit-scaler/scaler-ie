import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { fetchAllRows } from "@/lib/paged-fetch";
import AssignmentsView, { A } from "@/components/AssignmentsView";

export const dynamic = "force-dynamic";

const getAllAssignments = unstable_cache(
  () => fetchAllRows<A>("assignments", "id,program,company,role,round,link"),
  ["all-assignments"],
  { revalidate: 300, tags: ["assignments"] }
);

export default async function Assignments() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const all = await getAllAssignments();
  return <AssignmentsView initial={all} />;
}

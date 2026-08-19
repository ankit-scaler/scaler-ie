import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import PacketsView from "@/components/PacketsView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PacketsPage() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: packets } = await sb
    .from("packets")
    .select("id,role,yoe,doc_link,sort_order,content_synced_at")
    .order("sort_order");

  return <PacketsView packets={packets || []} />;
}

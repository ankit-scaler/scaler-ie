import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import PacketsView from "@/components/PacketsView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PacketsPage() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: packets }, { data: resources }] = await Promise.all([
    sb.from("packets").select("id,role,yoe,doc_link,sort_order,content_synced_at").order("sort_order"),
    sb.from("video_resources").select("packet_id"),
  ]);

  const packetsWithVideos = new Set((resources || []).map(r => r.packet_id));
  const withFlags = (packets || []).map(p => ({ ...p, hasVideoResources: packetsWithVideos.has(p.id) }));

  return <PacketsView packets={withFlags} />;
}

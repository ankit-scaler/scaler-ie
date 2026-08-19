import { redirect, notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import VideoResourcesReader from "@/components/VideoResourcesReader";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PacketResourcesPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const id = Number(params.id);
  if (!id) notFound();

  const [{ data: packet }, { data: resources }] = await Promise.all([
    sb.from("packets").select("id,role,yoe").eq("id", id).maybeSingle(),
    sb.from("video_resources").select("id,topic,video_link").eq("packet_id", id).order("sort_order"),
  ]);

  if (!packet) notFound();

  return <VideoResourcesReader packet={packet} resources={resources || []} />;
}

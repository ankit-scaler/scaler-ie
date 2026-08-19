import { redirect, notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import PacketReader from "@/components/PacketReader";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PacketPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const id = Number(params.id);
  if (!id) notFound();

  const { data: packet } = await sb
    .from("packets")
    .select("id,role,yoe,doc_title,doc_link,content_html,content_synced_at")
    .eq("id", id)
    .maybeSingle();

  if (!packet) notFound();

  return <PacketReader packet={packet} />;
}

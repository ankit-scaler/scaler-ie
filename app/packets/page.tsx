import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import PacketsView from "@/components/PacketsView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PacketsPage() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: packets }, { data: links }] = await Promise.all([
    sb.from("packets").select("id,role,yoe,doc_link,sort_order").order("sort_order"),
    sb.from("packet_session_links")
      .select("packet_id,sort_order,packet_sessions(id,title,url)")
      .order("sort_order"),
  ]);

  const sessionsByPacket = new Map<number, { id: number; title: string; url: string | null }[]>();
  (links || []).forEach((l: any) => {
    const s = l.packet_sessions;
    if (!s) return;
    const arr = sessionsByPacket.get(l.packet_id) || [];
    arr.push({ id: s.id, title: s.title, url: s.url });
    sessionsByPacket.set(l.packet_id, arr);
  });

  const grouped = (packets || []).map(p => ({
    ...p,
    sessions: sessionsByPacket.get(p.id) || [],
  }));

  return <PacketsView packets={grouped} />;
}

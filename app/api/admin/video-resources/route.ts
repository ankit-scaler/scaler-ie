import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase-server";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false }, { status: 403 });
  const admin = supabaseAdmin();
  const [packets, resources] = await Promise.all([
    admin.from("packets").select("id,role,yoe").order("sort_order"),
    admin.from("video_resources").select("id,packet_id,topic,video_link,sort_order").order("sort_order"),
  ]);
  if (packets.error) return NextResponse.json({ ok: false, error: packets.error.message }, { status: 400 });
  if (resources.error) return NextResponse.json({ ok: false, error: resources.error.message }, { status: 400 });
  return NextResponse.json({ ok: true, packets: packets.data || [], resources: resources.data || [] });
}

export async function POST(req: Request) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ ok: false }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const admin = supabaseAdmin();

  if (body.action === "create") {
    const packet_id = Number(body.packet_id);
    const topic = typeof body.topic === "string" ? body.topic.trim() : "";
    const video_link = typeof body.video_link === "string" ? body.video_link.trim() || null : null;
    if (!packet_id || !topic) return NextResponse.json({ ok: false, error: "Packet and topic are required." }, { status: 400 });

    const { data: top } = await admin.from("video_resources").select("sort_order").eq("packet_id", packet_id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const sort_order = (top?.sort_order ?? 0) + 1;

    const { error } = await admin.from("video_resources").insert({ packet_id, topic, video_link, sort_order });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "update") {
    const id = Number(body.id);
    const topic = typeof body.topic === "string" ? body.topic.trim() : "";
    const video_link = typeof body.video_link === "string" ? body.video_link.trim() || null : null;
    if (!id || !topic) return NextResponse.json({ ok: false, error: "Topic is required." }, { status: 400 });
    const { error } = await admin.from("video_resources").update({ topic, video_link }).eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "delete") {
    const id = Number(body.id);
    if (!id) return NextResponse.json({ ok: false }, { status: 400 });
    await admin.from("video_resources").delete().eq("id", id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false }, { status: 400 });
}

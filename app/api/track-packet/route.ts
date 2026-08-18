import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(req: Request) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const packetId = Number(body.packet_id);
  if (!packetId) return NextResponse.json({ ok: false }, { status: 400 });
  await sb.from("packet_views").insert({ user_email: user.email, packet_id: packetId });
  return NextResponse.json({ ok: true });
}

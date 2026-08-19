import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(req: Request) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const videoResourceId = Number(body.video_resource_id);
  if (!videoResourceId) return NextResponse.json({ ok: false }, { status: 400 });
  await sb.from("video_resource_views").insert({ user_email: user.email, video_resource_id: videoResourceId });
  return NextResponse.json({ ok: true });
}

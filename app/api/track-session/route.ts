import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(req: Request) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const sessionId = Number(body.session_id);
  if (!sessionId) return NextResponse.json({ ok: false }, { status: 400 });
  await sb.from("session_watches").insert({ user_email: user.email, session_id: sessionId });
  return NextResponse.json({ ok: true });
}

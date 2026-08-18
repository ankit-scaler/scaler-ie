import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";

// 5-minute rolling session: if last beat < 5 min ago, extend it; else new session.
export async function POST() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email) return NextResponse.json({ ok: false }, { status: 401 });
  const email = user.email;
  const admin = supabaseAdmin();

  const { data: recent } = await admin
    .from("sessions")
    .select("id,last_beat_at,started_at,duration_sec")
    .eq("user_email", email)
    .order("last_beat_at", { ascending: false })
    .limit(1);

  const now = new Date();
  const cutoff = new Date(now.getTime() - 5 * 60_000);

  if (recent && recent[0] && new Date(recent[0].last_beat_at) > cutoff) {
    const dur = Math.floor((now.getTime() - new Date(recent[0].started_at).getTime()) / 1000);
    await admin.from("sessions")
      .update({ last_beat_at: now.toISOString(), duration_sec: dur })
      .eq("id", recent[0].id);
  } else {
    await admin.from("sessions").insert({ user_email: email });
  }
  return NextResponse.json({ ok: true });
}

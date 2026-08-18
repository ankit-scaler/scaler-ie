import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";

export async function POST(req: Request) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  const admin = supabaseAdmin();
  const me = user?.email;
  if (!me) return NextResponse.json({ ok: false }, { status: 401 });
  const { data: check } = await admin.from("admins").select("email").eq("email", me).maybeSingle();
  if (!check) return NextResponse.json({ ok: false }, { status: 403 });

  const { email, action } = await req.json();
  if (!email || typeof email !== "string") return NextResponse.json({ ok: false }, { status: 400 });

  if (action === "remove") {
    if (email === "ankit.mishra@scaler.com") return NextResponse.json({ ok: false, error: "cannot remove root admin" }, { status: 400 });
    await admin.from("admins").delete().eq("email", email.toLowerCase());
  } else {
    await admin.from("admins").upsert({ email: email.toLowerCase(), added_by: me });
  }
  return NextResponse.json({ ok: true });
}

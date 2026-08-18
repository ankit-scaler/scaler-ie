import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase-server";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false }, { status: 403 });
  const admin = supabaseAdmin();
  const [packets, sessions] = await Promise.all([
    admin.from("packets").select("id,role,yoe,doc_title,doc_link,sort_order").order("sort_order"),
    admin.from("packet_sessions").select("id,title,url").order("title"),
  ]);
  return NextResponse.json({
    ok: true,
    packets: packets.data || [],
    sessions: sessions.data || [],
  });
}

export async function POST(req: Request) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ ok: false }, { status: 403 });

  const { type, id, value } = await req.json().catch(() => ({}));
  const url = typeof value === "string" ? value.trim() : "";
  if (!id || (type !== "packet" && type !== "session")) return NextResponse.json({ ok: false }, { status: 400 });

  const admin = supabaseAdmin();
  if (type === "packet") {
    await admin.from("packets").update({ doc_link: url || null }).eq("id", id);
  } else {
    await admin.from("packet_sessions").update({ url: url || null }).eq("id", id);
  }
  return NextResponse.json({ ok: true });
}

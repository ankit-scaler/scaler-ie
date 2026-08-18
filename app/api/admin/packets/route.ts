import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase-server";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false }, { status: 403 });
  const admin = supabaseAdmin();
  const packets = await admin.from("packets").select("id,role,yoe,doc_title,doc_link,sort_order").order("sort_order");
  return NextResponse.json({
    ok: true,
    packets: packets.data || [],
  });
}

export async function POST(req: Request) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ ok: false }, { status: 403 });

  const { id, value } = await req.json().catch(() => ({}));
  const url = typeof value === "string" ? value.trim() : "";
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  const admin = supabaseAdmin();
  await admin.from("packets").update({ doc_link: url || null }).eq("id", id);
  return NextResponse.json({ ok: true });
}

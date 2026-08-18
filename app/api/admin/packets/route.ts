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

  const body = await req.json().catch(() => ({}));
  const admin = supabaseAdmin();

  if (body.action === "create") {
    const role = typeof body.role === "string" ? body.role.trim() : "";
    const yoe = typeof body.yoe === "string" ? body.yoe.trim() : "";
    const doc_title = typeof body.doc_title === "string" ? body.doc_title.trim() || null : null;
    const doc_link = typeof body.doc_link === "string" ? body.doc_link.trim() || null : null;
    if (!role || !yoe) return NextResponse.json({ ok: false, error: "Role and YoE are required." }, { status: 400 });

    const { data: top } = await admin.from("packets").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const sort_order = (top?.sort_order ?? 0) + 1;

    const { error } = await admin.from("packets").insert({ role, yoe, doc_title, doc_link, sort_order });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "delete") {
    const id = Number(body.id);
    if (!id) return NextResponse.json({ ok: false }, { status: 400 });
    await admin.from("packets").delete().eq("id", id);
    return NextResponse.json({ ok: true });
  }

  const { id, value } = body;
  const url = typeof value === "string" ? value.trim() : "";
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  await admin.from("packets").update({ doc_link: url || null }).eq("id", id);
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase-server";
import { fetchDocContentHtml } from "@/lib/google-docs";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false }, { status: 403 });
  const admin = supabaseAdmin();
  const packets = await admin
    .from("packets")
    .select("id,role,yoe,doc_title,doc_link,sort_order,content_synced_at")
    .order("sort_order");
  return NextResponse.json({
    ok: true,
    packets: packets.data || [],
  });
}

// Fetches doc_link's content and caches it on the packet row, or clears the
// cache when doc_link is empty. Never throws — callers get { ok, error }.
async function syncContent(admin: ReturnType<typeof supabaseAdmin>, id: number, docLink: string | null) {
  if (!docLink) {
    await admin.from("packets").update({ content_html: null, content_synced_at: null }).eq("id", id);
    return { ok: true as const };
  }
  try {
    const html = await fetchDocContentHtml(docLink);
    await admin.from("packets").update({ content_html: html, content_synced_at: new Date().toISOString() }).eq("id", id);
    return { ok: true as const };
  } catch (e: any) {
    return { ok: false as const, error: e?.message || "Couldn't fetch doc content." };
  }
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

    const { data: inserted, error } = await admin.from("packets").insert({ role, yoe, doc_title, doc_link, sort_order }).select("id").single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    const sync = await syncContent(admin, inserted.id, doc_link);
    if (!sync.ok) return NextResponse.json({ ok: true, warning: `Packet added, but content sync failed: ${sync.error}` });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "delete") {
    const id = Number(body.id);
    if (!id) return NextResponse.json({ ok: false }, { status: 400 });
    await admin.from("packets").delete().eq("id", id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "refresh") {
    const id = Number(body.id);
    if (!id) return NextResponse.json({ ok: false }, { status: 400 });
    const { data: packet } = await admin.from("packets").select("doc_link").eq("id", id).maybeSingle();
    if (!packet?.doc_link) return NextResponse.json({ ok: false, error: "No doc link set for this packet." }, { status: 400 });
    const sync = await syncContent(admin, id, packet.doc_link);
    if (!sync.ok) return NextResponse.json({ ok: false, error: sync.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  // default: save the doc link (existing behavior), then (re)sync content from it
  const { id, value } = body;
  const url = typeof value === "string" ? value.trim() : "";
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  await admin.from("packets").update({ doc_link: url || null }).eq("id", id);
  const sync = await syncContent(admin, id, url || null);
  if (!sync.ok) return NextResponse.json({ ok: true, warning: `Link saved, but content sync failed: ${sync.error}` });
  return NextResponse.json({ ok: true });
}

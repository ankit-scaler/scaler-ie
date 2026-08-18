import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase-server";

function fp(...parts: (string | null | undefined)[]) {
  return createHash("sha256").update(parts.map(p => p || "").join("||")).digest("hex");
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false }, { status: 403 });
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("assignments")
    .select("id,program,company,role,round,link")
    .order("id", { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, assignments: data || [] });
}

export async function POST(req: Request) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ ok: false }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const admin = supabaseAdmin();

  if (body.action === "create" || body.action === "update") {
    const program = typeof body.program === "string" ? body.program.trim() || null : null;
    const company = typeof body.company === "string" ? body.company.trim() : "";
    const role    = typeof body.role === "string" ? body.role.trim() : "";
    const round   = typeof body.round === "string" ? body.round.trim() || null : null;
    const link    = typeof body.link === "string" ? body.link.trim() || null : null;
    if (!company || !role) return NextResponse.json({ ok: false, error: "Company and Role are required." }, { status: 400 });

    const fingerprint = fp(program, company, role, round, link);

    if (body.action === "create") {
      const { error } = await admin.from("assignments").insert({ program, company, role, round, link, fingerprint });
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    const id = Number(body.id);
    if (!id) return NextResponse.json({ ok: false }, { status: 400 });
    const { error } = await admin.from("assignments").update({ program, company, role, round, link, fingerprint }).eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "delete") {
    const id = Number(body.id);
    if (!id) return NextResponse.json({ ok: false }, { status: 400 });
    await admin.from("assignments").delete().eq("id", id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false }, { status: 400 });
}

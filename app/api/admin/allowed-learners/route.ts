import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase-server";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false }, { status: 403 });
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("allowed_learners")
    .select("email,synced_at,added_by")
    .order("synced_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, learners: data || [] });
}

export async function POST(req: Request) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ ok: false }, { status: 403 });

  const { email, action } = await req.json().catch(() => ({}));
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ ok: false, error: "A valid email is required." }, { status: 400 });
  }
  const admin = supabaseAdmin();

  if (action === "remove") {
    await admin.from("allowed_learners").delete().eq("email", email.toLowerCase());
    return NextResponse.json({ ok: true });
  }

  // added_by = me marks this as a manual grant, which the nightly sheet sync
  // will never delete even if the email isn't (or isn't yet) on the sheet.
  const { error } = await admin
    .from("allowed_learners")
    .upsert({ email: email.toLowerCase(), added_by: me, synced_at: new Date().toISOString() });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

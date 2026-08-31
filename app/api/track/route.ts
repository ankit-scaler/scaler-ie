import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(req: Request) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  await sb.from("page_views").insert({
    user_email: user.email,
    company: body.company ?? null,
    role:    body.role    ?? null,
    program: body.program ?? null,
    topic:   body.topic   ?? null,
    path:    body.path    ?? null,
  });
  return NextResponse.json({ ok: true });
}

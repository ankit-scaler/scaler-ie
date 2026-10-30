import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(req: Request) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const jobId = Number(body.job_id);
  if (!jobId) return NextResponse.json({ ok: false }, { status: 400 });
  await sb.from("job_applies").insert({ user_email: user.email, job_id: jobId });
  return NextResponse.json({ ok: true });
}

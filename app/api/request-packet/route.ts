import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { findPacketByCompanyRole } from "@/lib/packets-db";

const PACKET_GENERATOR_BASE = "https://interview-experiences-packets-creat.vercel.app/p/";

export async function POST(req: Request) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const company = typeof body.company === "string" ? body.company.trim() : "";
  const role = typeof body.role === "string" ? body.role.trim() : "";
  if (!company || !role) {
    return NextResponse.json({ ok: false, error: "Company and role are required." }, { status: 400 });
  }

  const match = await findPacketByCompanyRole(company, role);

  // No match: the client sends the learner to the request form (Typeform),
  // so nothing is logged or posted to Slack from here anymore.
  if (match) return NextResponse.json({ ok: true, matched: true, link: `${PACKET_GENERATOR_BASE}${match.slug}` });
  return NextResponse.json({ ok: true, matched: false });
}

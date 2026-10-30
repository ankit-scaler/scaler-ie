import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getPublishedPackets } from "@/lib/packets-db";

// Feeds the Request Packet form's Company/Role dropdowns — real existing
// company+role pairs, so a learner can pick a name that's known to match
// instead of guessing (e.g. "SDE" vs the stored "SDE - 1").
export async function GET() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const packets = await getPublishedPackets();
  const options = packets.map(p => ({ company: p.company, role: p.role }));
  return NextResponse.json({ ok: true, options });
}

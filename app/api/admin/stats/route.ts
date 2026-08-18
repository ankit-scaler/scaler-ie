import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";

async function isAdmin(email: string | undefined) {
  if (!email) return false;
  const admin = supabaseAdmin();
  const { data } = await admin.from("admins").select("email").eq("email", email).maybeSingle();
  return !!data;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!(await isAdmin(user?.email))) return NextResponse.json({ ok: false }, { status: 403 });
  if (url.searchParams.get("check")) return NextResponse.json({ ok: true });

  const range = url.searchParams.get("range") || "week"; // day | week | month
  const days = range === "day" ? 1 : range === "month" ? 30 : 7;
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  const admin = supabaseAdmin();
  const [views, sessions, admins] = await Promise.all([
    admin.from("page_views").select("user_email,company,role,program,created_at").gte("created_at", since),
    admin.from("sessions").select("user_email,duration_sec,started_at").gte("started_at", since),
    admin.from("admins").select("email,added_at,added_by").order("added_at", { ascending: true }),
  ]);

  return NextResponse.json({
    ok: true,
    range,
    views: views.data || [],
    sessions: sessions.data || [],
    admins: admins.data || [],
  });
}

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

  const range = url.searchParams.get("range") || "week"; // day | week | month | custom
  const from = url.searchParams.get("from"); // YYYY-MM-DD
  const to   = url.searchParams.get("to");   // YYYY-MM-DD

  let since: string;
  let until: string | null = null;
  if (range === "custom" && from) {
    since = new Date(`${from}T00:00:00.000Z`).toISOString();
    until = new Date(`${to || from}T23:59:59.999Z`).toISOString();
  } else {
    const days = range === "day" ? 1 : range === "month" ? 30 : 7;
    since = new Date(Date.now() - days * 86400_000).toISOString();
  }

  const admin = supabaseAdmin();
  let viewsQ    = admin.from("page_views").select("user_email,company,role,program,created_at").gte("created_at", since);
  let sessionsQ = admin.from("sessions").select("user_email,duration_sec,started_at").gte("started_at", since);
  let packetViewsQ    = admin.from("packet_views").select("user_email,created_at,packets(role,yoe)").gte("created_at", since);
  let sessionWatchesQ = admin.from("session_watches").select("user_email,created_at,packet_sessions(title)").gte("created_at", since);
  if (until) {
    viewsQ           = viewsQ.lte("created_at", until);
    sessionsQ        = sessionsQ.lte("started_at", until);
    packetViewsQ     = packetViewsQ.lte("created_at", until);
    sessionWatchesQ  = sessionWatchesQ.lte("created_at", until);
  }

  const [views, sessions, admins, packetViews, sessionWatches] = await Promise.all([
    viewsQ,
    sessionsQ,
    admin.from("admins").select("email,added_at,added_by").order("added_at", { ascending: true }),
    packetViewsQ,
    sessionWatchesQ,
  ]);

  return NextResponse.json({
    ok: true,
    range,
    views: views.data || [],
    sessions: sessions.data || [],
    admins: admins.data || [],
    packetViews: (packetViews.data || []).map((r: any) => ({
      user_email: r.user_email, created_at: r.created_at,
      role: r.packets?.role ?? null, yoe: r.packets?.yoe ?? null,
    })),
    sessionWatches: (sessionWatches.data || []).map((r: any) => ({
      user_email: r.user_email, created_at: r.created_at,
      title: r.packet_sessions?.title ?? null,
    })),
  });
}

import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";

// Internal Scaler accounts (content team, admins, anyone poking at the site)
// aren't learners, so their activity must not inflate any tracking number.
// Excluded at read time rather than at write time: the track/* routes keep
// recording every row, so this stays reversible and no history is thrown
// away. sync/sync_sheet.py applies the same exclusion, so the tracking
// spreadsheet and this tab never disagree.
const INTERNAL_EMAIL_PATTERN = "%@scaler.com";

// India Standard Time has a fixed +05:30 offset (no DST), so every "day"
// boundary here is anchored to IST rather than UTC — this product's admins
// and learners are IST, and a UTC boundary made the preset ranges disagree
// with how AdminTracking.tsx buckets its charts by calendar date, silently
// dropping real activity right after UTC midnight. AdminTracking.tsx uses
// the same IST anchoring for its own date math, so the two stay in sync.
const IST_OFFSET = "+05:30";
function istMidnightIso(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00${IST_OFFSET}`).toISOString();
}
function istDaysAgoStr(n: number): string {
  return new Date(Date.now() - n * 86400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

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
    since = istMidnightIso(from);
    until = new Date(new Date(istMidnightIso(to || from)).getTime() + 86400_000 - 1).toISOString();
  } else {
    const days = range === "day" ? 1 : range === "15d" ? 15 : range === "month" ? 30 : 7;
    since = istMidnightIso(istDaysAgoStr(days - 1));
  }

  const admin = supabaseAdmin();
  const warnings: string[] = [];

  // Supabase caps a single request at ~1000 rows no matter what .limit() says,
  // and silently truncates. So every windowed table is read in pages of 1000
  // (one cheap count first, then pages in parallel, stable order by id) and
  // de-duplicated by id in case a row was inserted between page reads. Any
  // failure or hitting the safety cap is reported in `warnings` — it never
  // silently becomes "0 activity".
  const PAGE = 1000;
  const MAX_ROWS = 50000;
  async function fetchWindow(
    table: string, select: string, col: string
  ): Promise<any[]> {
    const filter = (q: any) => {
      let f = q.gte(col, since).not("user_email", "ilike", INTERNAL_EMAIL_PATTERN);
      if (until) f = f.lte(col, until);
      return f;
    };
    const head = await filter(admin.from(table).select("id", { count: "exact", head: true }));
    if (head.error) { warnings.push(`${table}: ${head.error.message}`); return []; }
    let total = head.count ?? 0;
    if (total > MAX_ROWS) { warnings.push(`${table}: ${total.toLocaleString()} rows in this window, showing the newest ${MAX_ROWS.toLocaleString()}`); total = MAX_ROWS; }
    const pages = Math.ceil(total / PAGE);
    const results = await Promise.all(
      Array.from({ length: pages }, (_, i) =>
        filter(admin.from(table).select(`id,${select}`)).order("id", { ascending: false }).range(i * PAGE, i * PAGE + PAGE - 1)
      )
    );
    const seen = new Set<number>();
    const rows: any[] = [];
    for (const r of results) {
      if (r.error) { warnings.push(`${table}: ${r.error.message}`); continue; }
      for (const row of r.data || []) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        rows.push(row);
      }
    }
    return rows;
  }

  // Exact per-day unique counts, computed in the database (see
  // supabase/add_admin_daily_activity.sql) — drives the charts and stat tiles.
  // If the migration hasn't been run yet, `daily` is null and the page falls
  // back to counting from the raw rows, with a warning.
  const dailyP = admin.rpc("admin_daily_activity", { p_since: since, p_until: until });

  const [views, sessions, admins, packetViews, assignmentViews, videoViews, feedback, jobApplies, companyPacketOpens, dailyRes] = await Promise.all([
    fetchWindow("page_views", "user_email,company,role,program,topic,path,created_at", "created_at"),
    fetchWindow("sessions", "user_email,duration_sec,started_at", "started_at"),
    admin.from("admins").select("email,added_at,added_by").order("added_at", { ascending: true }),
    fetchWindow("packet_views", "user_email,created_at,packets(role,yoe)", "created_at"),
    fetchWindow("assignment_views", "user_email,created_at,assignments(program,company,role,round)", "created_at"),
    fetchWindow("video_resource_views", "user_email,created_at,video_resources(topic,packets(role,yoe))", "created_at"),
    fetchWindow("feedback", "user_email,platform_rating,usefulness_rating,feedback_text,created_at", "created_at"),
    fetchWindow("job_applies", "user_email,job_id,created_at", "created_at"),
    fetchWindow("company_packet_opens", "user_email,slug,created_at", "created_at"),
    dailyP,
  ]);

  let daily: any[] | null = null;
  if (dailyRes.error) {
    warnings.push(`daily counts: ${dailyRes.error.message} — run supabase/add_admin_daily_activity.sql in Supabase; charts fall back to the loaded rows`);
  } else {
    daily = dailyRes.data || [];
  }

  return NextResponse.json({
    ok: true,
    range,
    views,
    sessions,
    admins: admins.data || [],
    daily,
    warnings,
    packetViews: packetViews.map((r: any) => ({
      user_email: r.user_email, created_at: r.created_at,
      role: r.packets?.role ?? null, yoe: r.packets?.yoe ?? null,
    })),
    assignmentViews: assignmentViews.map((r: any) => ({
      user_email: r.user_email, created_at: r.created_at,
      program: r.assignments?.program ?? null,
      company: r.assignments?.company ?? null,
      role: r.assignments?.role ?? null,
      round: r.assignments?.round ?? null,
    })),
    videoViews: videoViews.map((r: any) => ({
      user_email: r.user_email, created_at: r.created_at,
      topic: r.video_resources?.topic ?? null,
      role: r.video_resources?.packets?.role ?? null,
      yoe: r.video_resources?.packets?.yoe ?? null,
    })),
    feedback,
    jobApplies,
    companyPacketOpens,
  });
}

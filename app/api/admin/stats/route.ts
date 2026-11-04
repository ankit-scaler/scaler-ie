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

  // Explicit row cap on every windowed query — without it, a query is
  // subject to PostgREST's default max-rows setting (commonly 1000), which
  // truncates silently with no error and no indication in the response that
  // the window's real data was cut short.
  const ROW_CAP = 20000;
  const admin = supabaseAdmin();
  let viewsQ           = admin.from("page_views").select("user_email,company,role,program,topic,path,created_at").gte("created_at", since).not("user_email", "ilike", INTERNAL_EMAIL_PATTERN).limit(ROW_CAP);
  let sessionsQ        = admin.from("sessions").select("user_email,duration_sec,started_at").gte("started_at", since).not("user_email", "ilike", INTERNAL_EMAIL_PATTERN).limit(ROW_CAP);
  let packetViewsQ     = admin.from("packet_views").select("user_email,created_at,packets(role,yoe)").gte("created_at", since).not("user_email", "ilike", INTERNAL_EMAIL_PATTERN).limit(ROW_CAP);
  let assignmentViewsQ = admin.from("assignment_views").select("user_email,created_at,assignments(program,company,role,round)").gte("created_at", since).not("user_email", "ilike", INTERNAL_EMAIL_PATTERN).limit(ROW_CAP);
  let videoViewsQ      = admin.from("video_resource_views").select("user_email,created_at,video_resources(topic,packets(role,yoe))").gte("created_at", since).not("user_email", "ilike", INTERNAL_EMAIL_PATTERN).limit(ROW_CAP);
  let feedbackQ        = admin.from("feedback").select("user_email,platform_rating,usefulness_rating,feedback_text,created_at").gte("created_at", since).not("user_email", "ilike", INTERNAL_EMAIL_PATTERN).limit(ROW_CAP);
  let jobAppliesQ      = admin.from("job_applies").select("user_email,job_id,created_at").gte("created_at", since).not("user_email", "ilike", INTERNAL_EMAIL_PATTERN).limit(ROW_CAP);
  let companyPacketOpensQ = admin.from("company_packet_opens").select("user_email,slug,created_at").gte("created_at", since).not("user_email", "ilike", INTERNAL_EMAIL_PATTERN).limit(ROW_CAP);
  if (until) {
    viewsQ           = viewsQ.lte("created_at", until);
    sessionsQ        = sessionsQ.lte("started_at", until);
    packetViewsQ     = packetViewsQ.lte("created_at", until);
    assignmentViewsQ = assignmentViewsQ.lte("created_at", until);
    videoViewsQ      = videoViewsQ.lte("created_at", until);
    feedbackQ        = feedbackQ.lte("created_at", until);
    jobAppliesQ      = jobAppliesQ.lte("created_at", until);
    companyPacketOpensQ = companyPacketOpensQ.lte("created_at", until);
  }

  const [views, sessions, admins, packetViews, assignmentViews, videoViews, feedback, jobApplies, companyPacketOpens] = await Promise.all([
    viewsQ,
    sessionsQ,
    admin.from("admins").select("email,added_at,added_by").order("added_at", { ascending: true }),
    packetViewsQ,
    assignmentViewsQ,
    videoViewsQ,
    feedbackQ,
    jobAppliesQ,
    companyPacketOpensQ,
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
    assignmentViews: (assignmentViews.data || []).map((r: any) => ({
      user_email: r.user_email, created_at: r.created_at,
      program: r.assignments?.program ?? null,
      company: r.assignments?.company ?? null,
      role: r.assignments?.role ?? null,
      round: r.assignments?.round ?? null,
    })),
    videoViews: (videoViews.data || []).map((r: any) => ({
      user_email: r.user_email, created_at: r.created_at,
      topic: r.video_resources?.topic ?? null,
      role: r.video_resources?.packets?.role ?? null,
      yoe: r.video_resources?.packets?.yoe ?? null,
    })),
    feedback: feedback.data || [],
    jobApplies: jobApplies.data || [],
    companyPacketOpens: companyPacketOpens.data || [],
  });
}

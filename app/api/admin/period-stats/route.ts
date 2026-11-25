import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";

// Unique users per IST day / week / month for the Tracking page's usage table.
// Counting happens in Postgres (supabase/add_admin_period_activity.sql).

type Grain = "day" | "week" | "month";
const METRICS = ["app", "questions", "assignments", "packets", "trending", "hiring", "crash_course"] as const;

const ymd = (d: Date) => d.toISOString().slice(0, 10);

// The last 5 COMPLETE periods, newest first, as YYYY-MM-DD period starts
// (IST calendar; weeks start Monday). Mirrors the SQL function's window.
function periodStarts(grain: Grain): string[] {
  const today = new Date(`${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })}T00:00:00Z`);
  const out: string[] = [];
  if (grain === "day") {
    for (let i = 1; i <= 5; i++) out.push(ymd(new Date(today.getTime() - i * 86400_000)));
  } else if (grain === "week") {
    const monday = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * 86400_000);
    for (let i = 1; i <= 5; i++) out.push(ymd(new Date(monday.getTime() - i * 7 * 86400_000)));
  } else {
    for (let i = 1; i <= 5; i++) out.push(ymd(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1))));
  }
  return out;
}

export async function GET(req: Request) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email) return NextResponse.json({ ok: false }, { status: 403 });
  const admin = supabaseAdmin();
  const { data: adminRow } = await admin.from("admins").select("email").eq("email", user.email).maybeSingle();
  if (!adminRow) return NextResponse.json({ ok: false }, { status: 403 });

  const g = new URL(req.url).searchParams.get("grain");
  const grain: Grain = g === "week" || g === "month" ? g : "day";

  const { data, error } = await admin.rpc("admin_period_activity", { p_grain: grain });
  if (error) {
    return NextResponse.json({
      ok: false,
      error: `${error.message} — run supabase/add_admin_period_activity.sql in the Supabase SQL editor`,
    }, { status: 500 });
  }

  const periods = periodStarts(grain);
  const counts: Record<string, Record<string, number>> = {};
  METRICS.forEach(m => { counts[m] = Object.fromEntries(periods.map(p => [p, 0])); });
  (data || []).forEach((r: { period: string; metric: string; users: number }) => {
    if (counts[r.metric] && r.period in counts[r.metric]) counts[r.metric][r.period] = r.users;
  });

  return NextResponse.json({ ok: true, grain, periods, counts });
}

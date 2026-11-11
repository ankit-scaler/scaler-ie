import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { findPacketByCompanyRole } from "@/lib/packets-db";

const PACKET_GENERATOR_BASE = "https://interview-experiences-packets-creat.vercel.app/p/";
const MAX_JD = 20_000;     // a long JD is a few thousand characters; this just stops runaway pastes
const MAX_FIELD = 200;

// Learner-typed text goes into a Slack message. Slack treats <...> as
// links and mentions (<!channel>, <!here>, <@U123>), so escape &, < and >
// as Slack's docs ask, or a learner could ping the whole channel.
const slackSafe = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function notifySlack(fields: { email: string; contact: string; company: string; role: string; jd: string; interviewDate: string; source: string }) {
  const webhookUrl = process.env.SLACK_PACKET_REQUESTS_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error("SLACK_PACKET_REQUESTS_WEBHOOK_URL isn't configured — packet request not posted to Slack");
    return false;
  }
  const text = [
    "*New packet request* — no existing packet found",
    `*Email:* ${slackSafe(fields.email)}`,
    `*Contact:* ${slackSafe(fields.contact)}`,
    `*Company:* ${slackSafe(fields.company)}`,
    `*Role:* ${slackSafe(fields.role)}`,
    `*Interview/Assessment date:* ${slackSafe(fields.interviewDate) || "—"}`,
    `*Requested from:* ${fields.source || "—"}`,
    `*JD:*\n${fields.jd ? slackSafe(fields.jd.slice(0, 2000)) : "—"}`,
  ].join("\n");
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const company = str(body.company, MAX_FIELD);
  const role = str(body.role, MAX_FIELD);
  const jd = str(body.jd, MAX_JD);
  const contactNumber = str(body.contactNumber, 40);
  // A date input sends YYYY-MM-DD; anything else would make the insert fail.
  const rawDate = str(body.interviewDate, 10);
  const interviewDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : "";
  // Which page the request came from; a fixed list, so it's safe for Slack.
  const source = ["Open Hirings", "Packets"].includes(body.source) ? (body.source as string) : "";
  if (!company || !role || !contactNumber) {
    return NextResponse.json({ ok: false, error: "Company, role, and contact number are required." }, { status: 400 });
  }

  // If the packet database can't be reached, still take the request (as "no
  // packet found") rather than losing it behind an error.
  const match = await findPacketByCompanyRole(company, role).catch(e => {
    console.error("request-packet: packet lookup failed, treating as no match:", e);
    return null;
  });

  if (match) {
    await saveRequest(sb, {
      user_email: user.email, contact_number: contactNumber, company, role,
      jd_text: jd || null, interview_date: interviewDate || null,
      matched_slug: match.slug, slack_notified: false,
    });
    return NextResponse.json({ ok: true, matched: true, link: `${PACKET_GENERATOR_BASE}${match.slug}` });
  }

  const notified = await notifySlack({ email: user.email, contact: contactNumber, company, role, jd, interviewDate, source });
  await saveRequest(sb, {
    user_email: user.email, contact_number: contactNumber, company, role,
    jd_text: jd || null, interview_date: interviewDate || null,
    matched_slug: null, slack_notified: notified,
  });
  return NextResponse.json({ ok: true, matched: false });
}

// The request log is a record, not the hand-off (Slack is), so a failed
// insert doesn't fail the learner's request — but it's logged, not ignored.
async function saveRequest(sb: ReturnType<typeof supabaseServer>, row: Record<string, unknown>) {
  const { error } = await sb.from("packet_requests").insert(row);
  if (error) console.error("request-packet: couldn't save to packet_requests:", error.message);
}

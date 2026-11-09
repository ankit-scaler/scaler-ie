import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { findPacketByCompanyRole } from "@/lib/packets-db";

const PACKET_GENERATOR_BASE = "https://interview-experiences-packets-creat.vercel.app/p/";

async function notifySlack(fields: { email: string; contact: string; company: string; role: string; jd: string; interviewDate: string }) {
  const webhookUrl = process.env.SLACK_PACKET_REQUESTS_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error("SLACK_PACKET_REQUESTS_WEBHOOK_URL isn't configured — packet request not posted to Slack");
    return false;
  }
  const text = [
    "*New packet request* — no existing packet found",
    `*Email:* ${fields.email}`,
    `*Contact:* ${fields.contact}`,
    `*Company:* ${fields.company}`,
    `*Role:* ${fields.role}`,
    `*Interview/Assessment date:* ${fields.interviewDate || "—"}`,
    `*JD:*\n${fields.jd ? fields.jd.slice(0, 2000) : "—"}`,
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
  const company = typeof body.company === "string" ? body.company.trim() : "";
  const role = typeof body.role === "string" ? body.role.trim() : "";
  const jd = typeof body.jd === "string" ? body.jd.trim() : "";
  const interviewDate = typeof body.interviewDate === "string" ? body.interviewDate.trim() : "";
  const contactNumber = typeof body.contactNumber === "string" ? body.contactNumber.trim() : "";
  if (!company || !role || !contactNumber) {
    return NextResponse.json({ ok: false, error: "Company, role, and contact number are required." }, { status: 400 });
  }

  const match = await findPacketByCompanyRole(company, role);

  if (match) {
    await sb.from("packet_requests").insert({
      user_email: user.email, contact_number: contactNumber, company, role,
      jd_text: jd || null, interview_date: interviewDate || null,
      matched_slug: match.slug, slack_notified: false,
    });
    return NextResponse.json({ ok: true, matched: true, link: `${PACKET_GENERATOR_BASE}${match.slug}` });
  }

  const notified = await notifySlack({ email: user.email, contact: contactNumber, company, role, jd, interviewDate });
  await sb.from("packet_requests").insert({
    user_email: user.email, contact_number: contactNumber, company, role,
    jd_text: jd || null, interview_date: interviewDate || null,
    matched_slug: null, slack_notified: notified,
  });
  return NextResponse.json({ ok: true, matched: false });
}

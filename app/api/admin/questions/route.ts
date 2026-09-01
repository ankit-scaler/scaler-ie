import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase-server";
import { CANONICAL_TOPICS } from "@/lib/topics";

// Table has 10k+ rows — never list it wholesale. Search-only: returns up to
// 50 matches by id, company, role, or question text.
const RESULT_LIMIT = 50;

export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false }, { status: 403 });
  const q = new URL(req.url).searchParams.get("q")?.trim() || "";
  if (!q) return NextResponse.json({ ok: true, rows: [] });

  const admin = supabaseAdmin();
  const cols = "id,company,role,program,question,related_topic,topic_ai";

  const asId = Number(q);
  if (Number.isInteger(asId) && String(asId) === q) {
    const { data, error } = await admin.from("questions").select(cols).eq("id", asId).limit(RESULT_LIMIT);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, rows: data || [] });
  }

  // Three separate ilike queries instead of one .or(...) filter — a search
  // term containing a comma or parenthesis would otherwise break
  // PostgREST's or() filter DSL, which splits on those characters.
  const pattern = `%${q}%`;
  const [byQuestion, byCompany, byRole] = await Promise.all([
    admin.from("questions").select(cols).ilike("question", pattern).order("id", { ascending: false }).limit(RESULT_LIMIT),
    admin.from("questions").select(cols).ilike("company", pattern).order("id", { ascending: false }).limit(RESULT_LIMIT),
    admin.from("questions").select(cols).ilike("role", pattern).order("id", { ascending: false }).limit(RESULT_LIMIT),
  ]);
  const err = byQuestion.error || byCompany.error || byRole.error;
  if (err) return NextResponse.json({ ok: false, error: err.message }, { status: 400 });

  const seen = new Set<number>();
  const rows = [...(byQuestion.data || []), ...(byCompany.data || []), ...(byRole.data || [])]
    .filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a, b) => b.id - a.id)
    .slice(0, RESULT_LIMIT);
  return NextResponse.json({ ok: true, rows });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (body.action !== "update") return NextResponse.json({ ok: false }, { status: 400 });

  const id = Number(body.id);
  const topic_ai = body.topic_ai === null ? null : String(body.topic_ai || "");
  if (!id) return NextResponse.json({ ok: false, error: "Missing id." }, { status: 400 });
  if (topic_ai !== null && !(CANONICAL_TOPICS as readonly string[]).includes(topic_ai)) {
    return NextResponse.json({ ok: false, error: "Not a valid topic." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { error } = await admin.from("questions").update({ topic_ai, topic_ai_manual: true }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

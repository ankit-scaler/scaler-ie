import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase-server";

// Table has 10k+ rows — never list it wholesale. Two modes:
//  - `q` (keyword search): up to 50 matches by id, company, role, or
//    question text, no pagination.
//  - `topic` (browse by topic): every question currently holding that
//    exact topic_ai, paginated — some topics have 1000+ rows.
const RESULT_LIMIT = 50;
const PAGE_SIZE = 50;

export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false }, { status: 403 });
  const params = new URL(req.url).searchParams;
  const q = params.get("q")?.trim() || "";
  const topic = params.get("topic")?.trim() || "";
  const page = Math.max(0, Number(params.get("page")) || 0);

  const admin = supabaseAdmin();
  const cols = "id,company,role,program,question,related_topic,topic_ai";

  if (topic) {
    let query = admin.from("questions").select(cols, { count: "exact" }).eq("topic_ai", topic);
    // Optional keyword narrows within the topic instead of the separate
    // search path below — one ilike is safe here (single filter, no
    // .or()), unlike the multi-column search which needs the workaround.
    if (q) query = query.ilike("question", `%${q}%`);
    const { data, count, error } = await query
      .order("id", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, rows: data || [], total: count ?? 0, page, pageSize: PAGE_SIZE });
  }

  if (!q) return NextResponse.json({ ok: true, rows: [] });

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

  const admin = supabaseAdmin();
  if (topic_ai !== null) {
    // Validated against the live canonical_topics table, not a hardcoded
    // list — so a topic added moments ago in Admin's topic manager is
    // immediately assignable here too.
    const { data: match, error: lookupErr } = await admin
      .from("canonical_topics").select("name").eq("name", topic_ai).maybeSingle();
    if (lookupErr) return NextResponse.json({ ok: false, error: lookupErr.message }, { status: 400 });
    if (!match) return NextResponse.json({ ok: false, error: "Not a valid topic." }, { status: 400 });
  }

  const { error } = await admin.from("questions").update({ topic_ai, topic_ai_manual: true }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase-server";

// The canonical AI-topic taxonomy now lives in the canonical_topics table
// (see supabase/add_canonical_topics.sql), not a hardcoded list — this is
// the only place that reads/writes it for the website. The nightly Gemini
// classifier (sync/topics.py) reads the same table independently.

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false }, { status: 403 });
  const admin = supabaseAdmin();

  const [{ data: topicRows, error: topicsErr }, { data: countRows, error: countErr }] = await Promise.all([
    admin.from("canonical_topics").select("id,name").order("name"),
    admin.rpc("topic_ai_counts"),
  ]);
  if (topicsErr) return NextResponse.json({ ok: false, error: topicsErr.message }, { status: 400 });
  if (countErr) return NextResponse.json({ ok: false, error: countErr.message }, { status: 400 });

  const countMap = new Map<string, number>((countRows || []).map((r: any) => [r.topic, Number(r.cnt)]));
  const canonicalNames = new Set((topicRows || []).map(r => r.name));

  const topics = (topicRows || []).map(r => ({ id: r.id, name: r.name, count: countMap.get(r.name) || 0 }));
  // topic_ai values present on questions that canonical_topics doesn't
  // recognize — should normally be empty; surfaced here so a stale value
  // (like the old "Java" tag before this table existed) is visible in
  // Admin instead of needing a one-off DB query to find.
  const orphans = (countRows || [])
    .filter((r: any) => r.topic && !canonicalNames.has(r.topic))
    .map((r: any) => ({ name: r.topic as string, count: Number(r.cnt) }));

  return NextResponse.json({ ok: true, topics, orphans });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ ok: false, error: "Topic name is required." }, { status: 400 });

  const admin = supabaseAdmin();
  const { error } = await admin.from("canonical_topics").insert({ name });
  if (error) {
    const msg = error.code === "23505" ? `"${name}" already exists.` : error.message;
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const oldName = String(body.oldName || "").trim();
  const newName = String(body.newName || "").trim();
  if (!oldName || !newName) {
    return NextResponse.json({ ok: false, error: "Both oldName and newName are required." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  // Runs as one DB transaction (rename_canonical_topic in
  // add_canonical_topics.sql) — every question currently using oldName is
  // re-pointed to newName in the same statement as the rename itself, so
  // topic_ai can never end up holding a name this table no longer has.
  const { error } = await admin.rpc("rename_canonical_topic", { old_name: oldName, new_name: newName });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ ok: false, error: "Topic name is required." }, { status: 400 });

  const admin = supabaseAdmin();
  // delete_canonical_topic refuses (with a clear error) if any question
  // still has this topic_ai — an admin must reassign those first via "Fix
  // a question's topic" rather than the delete silently orphaning them.
  const { error } = await admin.rpc("delete_canonical_topic", { topic_name: name });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

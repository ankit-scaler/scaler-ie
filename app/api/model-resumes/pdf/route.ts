import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";

const BUCKET = "model-resumes";
const SIGNED_URL_SECONDS = 300;

// GET /api/model-resumes/pdf?slug=... -> { ok, url } with a 5-minute signed URL.
// The PDFs live in a PRIVATE bucket; this route is the only way to reach one,
// and only for a signed-in learner. Returns JSON (not a redirect) so the
// button can show a busy state while the URL is created.
export async function GET(req: Request) {
  if (process.env.MODEL_RESUME_PDF === "off") return NextResponse.json({ ok: false }, { status: 404 });

  const slug = new URL(req.url).searchParams.get("slug") || "";
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(slug)) return NextResponse.json({ ok: false }, { status: 400 });

  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email) return NextResponse.json({ ok: false }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: row } = await admin
    .from("model_resume").select("pdf_path").eq("slug", slug).eq("published", true).maybeSingle();
  if (!row?.pdf_path) return NextResponse.json({ ok: false }, { status: 404 });

  const { data, error } = await admin.storage
    .from(BUCKET).createSignedUrl(row.pdf_path, SIGNED_URL_SECONDS, { download: `${slug}.pdf` });
  if (error || !data?.signedUrl) return NextResponse.json({ ok: false, error: "Couldn't prepare the PDF." }, { status: 502 });

  // Usage event under the learner's own session (RLS); never blocks the download.
  try {
    await sb.from("model_resume_event").insert({ kind: "pdf_download", slug, user_email: user.email });
  } catch {
    /* tracking must not break the download */
  }
  return NextResponse.json({ ok: true, url: data.signedUrl });
}

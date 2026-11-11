import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getQuestionsChunk } from "@/lib/questions-chunks";

// One chunk of the question list for the Questions page (see
// lib/questions-chunks.ts). Signed-in learners only, like the page itself.
// The URL carries the data version (?v=…), and any data change gives a new
// version, so the browser can keep each chunk. "private" keeps the
// questions out of shared/CDN caches, so they stay behind sign-in.
export async function GET(req: Request, { params }: { params: { chunk: string } }) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to see questions." }, { status: 401 });

  const requested = new URL(req.url).searchParams.get("v") || "";
  try {
    const res = await getQuestionsChunk(Number(params.chunk), requested);
    if (res.kind === "stale") {
      // The data changed since the page loaded: send the current manifest so
      // the loader switches to it instead of mixing two versions.
      return NextResponse.json({ stale: true, ...res.manifest }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    if (res.kind === "missing") return NextResponse.json({ error: "No such chunk." }, { status: 404 });
    return NextResponse.json(res.rows, { headers: { "Cache-Control": `private, max-age=${res.maxAge}` } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Couldn't load questions. Try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

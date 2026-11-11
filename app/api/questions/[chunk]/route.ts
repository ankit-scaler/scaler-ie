import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { BROWSER_MAX_AGE, getQuestionsChunk } from "@/lib/questions-chunks";

// One chunk of the question list for the Questions page (see
// lib/questions-chunks.ts). Signed-in learners only, like the page itself.
// The URL carries the data version (?v=…), so a new version means new URLs;
// the browser keeps each chunk for at most a day either way. "private"
// keeps the questions out of shared/CDN caches, so they stay behind sign-in.
export async function GET(req: Request, { params }: { params: { chunk: string } }) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to see questions." }, { status: 401 });

  const requested = new URL(req.url).searchParams.get("v") || "";
  try {
    const rows = await getQuestionsChunk(Number(params.chunk), requested);
    if (rows === "stale") {
      // The data changed since the page loaded: the loader reloads the page's
      // manifest instead of mixing chunks from two versions.
      return NextResponse.json({ error: "stale" }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    if (rows === "missing") return NextResponse.json({ error: "No such chunk." }, { status: 404 });
    return NextResponse.json(rows, {
      headers: { "Cache-Control": `private, max-age=${BROWSER_MAX_AGE}` },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Couldn't load questions. Try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getQuestionsChunk, getQuestionsManifest } from "@/lib/questions-chunks";

// One chunk of the question list for the Questions page (see
// lib/questions-chunks.ts). Signed-in learners only, like the page itself.
// The URL carries the data version (?v=…), so the browser can keep each
// chunk for good: a new sync means a new version, which means new URLs.
// "private" keeps the questions out of shared/CDN caches, so they stay
// behind sign-in.
export async function GET(req: Request, { params }: { params: { chunk: string } }) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to see questions." }, { status: 401 });

  const chunk = Number(params.chunk);
  const requested = new URL(req.url).searchParams.get("v") || "";
  const { version, chunks } = await getQuestionsManifest();
  if (!Number.isInteger(chunk) || chunk < 0 || chunk >= chunks) {
    return NextResponse.json({ error: "No such chunk." }, { status: 404 });
  }

  try {
    const rows = await getQuestionsChunk(chunk, version);
    return NextResponse.json(rows, {
      headers: {
        // Only cache for good when the URL names the version being served;
        // a stale ?v= still gets fresh data, just not cached under that URL.
        "Cache-Control": requested === version ? "private, max-age=31536000, immutable" : "private, no-store",
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Couldn't load questions. Try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

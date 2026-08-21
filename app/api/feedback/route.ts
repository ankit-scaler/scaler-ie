import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(req: Request) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const platformRating = Number(body.platform_rating);
  const usefulnessRating = Number(body.usefulness_rating);
  const feedbackText = typeof body.feedback_text === "string" ? body.feedback_text.trim().slice(0, 2000) : "";

  const validRating = (n: number) => Number.isInteger(n) && n >= 1 && n <= 5;
  if (!validRating(platformRating) || !validRating(usefulnessRating)) {
    return NextResponse.json({ ok: false, error: "Please rate both questions (1-5 stars)." }, { status: 400 });
  }

  const { error } = await sb.from("feedback").insert({
    user_email: user.email,
    platform_rating: platformRating,
    usefulness_rating: usefulnessRating,
    feedback_text: feedbackText || null,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

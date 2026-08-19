import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { isAllowedToSignIn, safeNextPath } from "@/lib/access";

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));
  const sb = supabaseServer();

  if (code) {
    const { data } = await sb.auth.exchangeCodeForSession(code);
    const email = data.user?.email;
    if (email && !(await isAllowedToSignIn(email))) {
      await sb.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=not_allowed`);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}

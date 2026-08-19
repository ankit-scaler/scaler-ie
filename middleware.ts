import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get:    (n: string) => req.cookies.get(n)?.value,
        set:    (n: string, v: string, o: any) => res.cookies.set({ name: n, value: v, ...o }),
        remove: (n: string, o: any) => res.cookies.set({ name: n, value: "", ...o }),
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname, search } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const isAuthRoute = pathname.startsWith("/auth/");
  const isLogin = pathname === "/login";

  // Deep-linking: an unauthenticated request for any page (not API/auth/login
  // routes, which handle their own access checks) bounces to /login carrying
  // where it was headed, so app/login and app/auth/callback can send the user
  // back there once signed in instead of always landing on the homepage.
  if (!user && !isApi && !isAuthRoute && !isLogin) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  return res;
}

export const config = { matcher: ["/((?!_next|api/heartbeat|favicon|.*\\.).*)"] };
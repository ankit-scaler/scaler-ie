"use client";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function LoginPage() {
  const signIn = async () => {
    const sb = supabaseBrowser();
    await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  };
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center text-center">
      <h1 className="mb-3 font-display text-4xl leading-tight">
        Real questions.<br />From real Scaler learners.
      </h1>
      <p className="mb-8 text-mute">Sign in with Google to browse the vault.</p>
      <button
        onClick={signIn}
        className="inline-flex items-center gap-3 rounded-xl bg-text px-5 py-3 text-sm font-medium text-ink shadow-card transition hover:shadow-cardH"
      >
        <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.9 0 7.4 1.4 10.1 3.6l7.5-7.5C36.7 1.6 30.7-1 24-1 14.6-1 6.5 4.4 2.7 12.3l8.7 6.7C13.4 13.1 18.2 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.5-.1-3-.4-4.5H24v9h12.7c-.6 3-2.4 5.5-5 7.2l7.7 6c4.5-4.2 7.1-10.3 7.1-17.7z"/><path fill="#FBBC05" d="M11.4 28.9c-.6-1.7-.9-3.5-.9-5.4s.3-3.7.9-5.4l-8.7-6.7C1 15.2 0 19.5 0 24s1 8.8 2.7 12.6l8.7-7.7z"/><path fill="#34A853" d="M24 47c6.7 0 12.3-2.2 16.4-6l-7.7-6c-2.1 1.4-4.9 2.3-8.7 2.3-5.8 0-10.6-3.6-12.6-8.7l-8.7 6.7C6.5 43.6 14.6 47 24 47z"/></svg>
        Continue with Google
      </button>
      <p className="mt-6 font-mono text-[11px] uppercase tracking-widest text-mute">Get Set Prepare</p>
      <p className="mt-6 font-mono text-[11px] uppercase tracking-widest text-mute">For any issues Reach out to ankit.mishra@scaler.com</p>
    </div>
  );
}

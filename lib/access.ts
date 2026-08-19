import { supabaseAdmin } from "@/lib/supabase-server";

// Gate for who may use the app at all: any @scaler.com email (staff), admins,
// or anyone synced nightly into allowed_learners from the learner-tracking sheet.
export async function isAllowedToSignIn(email: string) {
  const lower = email.toLowerCase();
  if (lower.endsWith("@scaler.com")) return true;

  const admin = supabaseAdmin();
  const [{ data: asAdmin }, { data: asLearner }] = await Promise.all([
    admin.from("admins").select("email").eq("email", lower).maybeSingle(),
    admin.from("allowed_learners").select("email").eq("email", lower).maybeSingle(),
  ]);
  return !!asAdmin || !!asLearner;
}

// Only a same-origin relative path is a safe redirect target — anything else
// (a full URL, a protocol-relative "//evil.com") could send a signed-in user
// off-site, so we fall back to "/" instead.
export function safeNextPath(next: string | null): string {
  if (!next) return "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

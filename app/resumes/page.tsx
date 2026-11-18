import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getResumeCards } from "@/lib/model-resumes";
import type { ResumeCard } from "@/lib/model-resumes-types";
import ModelResumesList from "@/components/ModelResumesList";

export const dynamic = "force-dynamic";

export default async function ResumesPage() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  let cards: ResumeCard[] = [];
  let failed = false;
  try {
    cards = await getResumeCards();
  } catch {
    failed = true;
  }

  if (failed) {
    return (
      <div className="rounded-2xl border border-edge bg-panel p-10 text-center text-mute">
        Model resumes aren&rsquo;t available right now. Please try again in a few minutes.
      </div>
    );
  }
  return <ModelResumesList cards={cards} />;
}

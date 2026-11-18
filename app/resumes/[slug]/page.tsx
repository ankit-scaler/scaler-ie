import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getResume } from "@/lib/model-resumes";
import type { ResumeFull } from "@/lib/model-resumes-types";
import ModelResumeReader from "@/components/ModelResumeReader";

export const dynamic = "force-dynamic";

export default async function ResumePage({ params }: { params: { slug: string } }) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  // Letters, digits, "_" and "-" only: matches every real slug and keeps the
  // per-slug cache key space bounded.
  const slug = decodeURIComponent(params.slug);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(slug)) notFound();

  let resume: ResumeFull | null = null;
  try {
    resume = await getResume(slug);
  } catch {
    return (
      <div className="rounded-2xl border border-edge bg-panel p-10 text-center text-mute">
        This model resume isn&rsquo;t available right now. Please try again in a few minutes.
      </div>
    );
  }
  if (!resume) notFound();

  // Set MODEL_RESUME_PDF=off in Vercel to hide the PDF button (and block the route).
  return <ModelResumeReader resume={resume} pdfEnabled={process.env.MODEL_RESUME_PDF !== "off"} />;
}

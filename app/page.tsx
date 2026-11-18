import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { cachedPagedRows } from "@/lib/paged-fetch";
import { questionsCacheKey } from "@/lib/chunk-utils";
import { getQuestionsVersion } from "@/lib/sync-version";
import QuestionsView, { Q } from "@/components/QuestionsView";

export const dynamic = "force-dynamic";

// Questions data is identical for every signed-in learner (RLS just gates
// on "authenticated", nothing per-user) and only changes on the nightly
// sheet sync (23:00 IST) and when an admin fixes a topic — so the 13k-row read
// is cached for everyone instead of re-querying Supabase on every page load.
// It is cached in 1000-row chunks (cachedPagedRows): the whole table is ~4.5 MB
// and Vercel's Data Cache won't store any single item over 2 MB, which used to
// make the old single-entry cache a silent no-op. 6 hours is safe because an
// admin topic edit calls revalidateTag("questions") (app/api/admin/questions).
// On top of that, the nightly sync writes a "last synced" time (sync_meta) that is
// part of the cache key, so fresh questions appear on the first visit after the sync
// instead of waiting for the timer. The page itself stays dynamic (it still checks
// the caller's session on every request).
const getAllQuestions = async () => {
  const version = await getQuestionsVersion();
  return cachedPagedRows<Q>({
    keyBase: questionsCacheKey(version),
    table: "questions",
    select: "id,program,company,role,round,question,related_topic,topic_ai",
    revalidate: 6 * 3600,
    tags: ["questions"],
  });
};

export default async function Home() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const all = await getAllQuestions();
  return <QuestionsView initial={all} />;
}

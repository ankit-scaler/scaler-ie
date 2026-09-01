import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { fetchAllRows } from "@/lib/paged-fetch";
import QuestionsView, { Q } from "@/components/QuestionsView";

export const dynamic = "force-dynamic";

// Questions data is identical for every signed-in learner (RLS just gates
// on "authenticated", nothing per-user) and only changes on the nightly
// sheet sync — so the ~10k-row fetch is cached for everyone instead of
// re-querying Supabase on every single page load. The page itself stays
// dynamic (it still checks the caller's session on every request).
const getAllQuestions = unstable_cache(
  () => fetchAllRows<Q>("questions", "id,program,company,role,round,question,related_topic,topic_ai"),
  ["all-questions"],
  { revalidate: 300 }
);

export default async function Home() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const all = await getAllQuestions();
  return <QuestionsView initial={all} />;
}

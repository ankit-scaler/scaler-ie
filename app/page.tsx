import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { fetchAllRows } from "@/lib/paged-fetch";
import QuestionsView, { Q } from "@/components/QuestionsView";
import { getPacketLinks } from "@/lib/prep-data";

export const dynamic = "force-dynamic";

// Questions data is identical for every signed-in learner (RLS just gates
// on "authenticated", nothing per-user) and only changes on the nightly
// sheet sync — so the ~10k-row fetch is cached for everyone instead of
// re-querying Supabase on every single page load. The page itself stays
// dynamic (it still checks the caller's session on every request).
const QUESTION_COLS = "id,program,company,role,round,question,related_topic,topic_ai";
const getAllQuestions = unstable_cache(
  async () => {
    const withDates = await fetchAllRows<Q>("questions", `${QUESTION_COLS},asked_on`);
    if (withDates.length) return withDates;
    // asked_on only exists once supabase/add_question_asked_on.sql has run.
    // Before that, the select above fails and comes back empty — load the
    // questions without dates rather than showing an empty page.
    return fetchAllRows<Q>("questions", QUESTION_COLS);
  },
  ["all-questions"],
  { revalidate: 300 }
);

export default async function Home() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const [all, packets] = await Promise.all([getAllQuestions(), getPacketLinks()]);
  return <QuestionsView initial={all} packets={packets} />;
}

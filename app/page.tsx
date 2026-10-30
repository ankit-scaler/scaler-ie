import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { fetchTableCached } from "@/lib/cached-table";
import QuestionsView, { Q } from "@/components/QuestionsView";
import { getPacketLinks } from "@/lib/prep-data";

export const dynamic = "force-dynamic";

// Questions data is identical for every signed-in learner (RLS just gates
// on "authenticated", nothing per-user) and only changes on the nightly
// sheet sync — so it's cached for everyone, in chunks under Next's 2 MB
// cache limit and until the next sync (see lib/cached-table.ts). The page
// itself stays dynamic (it still checks the caller's session every request).
const getAllQuestions = () => fetchTableCached<Q>({
  dataset: "questions", table: "questions",
  select: "id,program,company,role,round,question,related_topic,topic_ai,asked_on",
});

export default async function Home() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const [all, packets] = await Promise.all([getAllQuestions(), getPacketLinks()]);
  return <QuestionsView initial={all} packets={packets} />;
}

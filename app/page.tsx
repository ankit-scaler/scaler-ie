import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import QuestionsView from "@/components/QuestionsView";

export const dynamic = "force-dynamic";

export default async function Home() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: questions } = await sb
    .from("questions")
    .select("id,program,company,role,round,question,related_topic")
    .order("id", { ascending: false })
    .limit(5000);

  return <QuestionsView initial={questions || []} />;
}

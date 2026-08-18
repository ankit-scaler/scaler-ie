import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import QuestionsView from "@/components/QuestionsView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  // Paginate — Supabase caps a single request at 1000 rows.
  const PAGE = 1000;
  let all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from("questions")
      .select("id,program,company,role,round,question,related_topic")
      .order("id", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) break;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return <QuestionsView initial={all} />;
}
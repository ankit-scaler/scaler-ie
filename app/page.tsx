import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getQuestionsManifest } from "@/lib/questions-chunks";
import QuestionsLoader from "@/components/QuestionsLoader";

export const dynamic = "force-dynamic";

// The page only checks the session and ships a tiny manifest; the browser
// loads the question list itself from cached chunk files (see
// lib/questions-chunks.ts). Building all ~13k questions into this page on
// every visit was ~100 ms of server CPU and a 5 MB response each time.
export default async function Home() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { version, chunks } = await getQuestionsManifest();
  return <QuestionsLoader version={version} chunks={chunks} />;
}

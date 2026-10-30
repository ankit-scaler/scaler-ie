import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getAllPackets, getPrepCounts } from "@/lib/prep-data";
import CompanyPacketsView from "@/components/CompanyPacketsView";

export const dynamic = "force-dynamic";

export default async function CompanyPacketsPage() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const [packets, prep] = await Promise.all([getAllPackets(), getPrepCounts()]);
  return <CompanyPacketsView initial={packets} prep={prep} />;
}

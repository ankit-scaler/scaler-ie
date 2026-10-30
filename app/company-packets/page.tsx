import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getPublishedPackets } from "@/lib/packets-db";
import CompanyPacketsView from "@/components/CompanyPacketsView";

export const dynamic = "force-dynamic";

const getAllPackets = unstable_cache(
  () => getPublishedPackets(),
  ["all-company-packets"],
  { revalidate: 300, tags: ["company-packets"] }
);

export default async function CompanyPacketsPage() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const packets = await getAllPackets();
  return <CompanyPacketsView initial={packets} />;
}

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { fetchTableCached } from "@/lib/cached-table";
import JobsView, { Job } from "@/components/JobsView";
import { getPacketLinks, getPrepCounts } from "@/lib/prep-data";

export const dynamic = "force-dynamic";

// Only the last 7 days' postings (the Open Hirings window); cached until the next jobs sync (see
// lib/cached-table.ts). The cutoff is part of the cache key, so it still
// moves forward each day.
const getAllJobs = () => {
  const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  return fetchTableCached<Job>({
    dataset: "jobs", table: "jobs",
    select: "id,site,title,company,location,is_remote,job_type,date_posted,job_url,search_role",
    filter: q => q.gte("date_posted", cutoff),
    keyExtra: cutoff,
  });
};

export default async function Jobs() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const [all, prep, packets] = await Promise.all([getAllJobs(), getPrepCounts(), getPacketLinks()]);
  return <JobsView initial={all} prep={prep} packets={packets} />;
}

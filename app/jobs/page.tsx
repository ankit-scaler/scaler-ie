import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { fetchTableCached } from "@/lib/cached-table";
import JobsView, { Job } from "@/components/JobsView";
import { getPacketLinks, getPrepCounts } from "@/lib/prep-data";

export const dynamic = "force-dynamic";

// Open Hirings shows Today, Today-1 and Today-2 in IST (mirrors
// sync/sync_jobs.py's prune). Cached until the next jobs sync (see
// lib/cached-table.ts); the cutoff is part of the cache key, so it still
// moves forward each day.
const getAllJobs = () => {
  const cutoff = new Date(Date.now() + 5.5 * 3600_000 - 2 * 86400_000).toISOString().slice(0, 10);
  return fetchTableCached<Job>({
    dataset: "jobs", table: "jobs",
    select: "id,site,title,company,location,is_remote,job_type,date_posted,job_url,search_role",
    filter: q => q.gte("date_posted", cutoff),
    keyExtra: cutoff,
  }).catch(e => { console.error(e); return [] as Job[]; });  // not cached; retried next view
};

export default async function Jobs() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const [all, prep, packets] = await Promise.all([getAllJobs(), getPrepCounts(), getPacketLinks()]);
  return <JobsView initial={all} prep={prep} packets={packets} />;
}

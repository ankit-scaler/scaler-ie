import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { fetchAllRows } from "@/lib/paged-fetch";
import JobsView, { Job } from "@/components/JobsView";
import { getPacketLinks, getPrepCounts } from "@/lib/prep-data";

export const dynamic = "force-dynamic";

const getAllJobs = unstable_cache(
  () => {
    const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    return fetchAllRows<Job>(
      "jobs", "id,site,title,company,location,is_remote,job_type,date_posted,job_url,search_role",
      q => q.gte("date_posted", cutoff)
    );
  },
  ["all-jobs"],
  { revalidate: 300, tags: ["jobs"] }
);

export default async function Jobs() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const [all, prep, packets] = await Promise.all([getAllJobs(), getPrepCounts(), getPacketLinks()]);
  return <JobsView initial={all} prep={prep} packets={packets} />;
}

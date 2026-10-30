import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getPublishedPackets } from "@/lib/packets-db";
import { companyKey, PacketLink, PrepCounts } from "@/lib/prep-shared";

// Published company packets, shared by every page that links to them.
// Same cache key and tag as the Company packets page used on its own.
export const getAllPackets = unstable_cache(
  () => getPublishedPackets(),
  ["all-company-packets"],
  { revalidate: 300, tags: ["company-packets"] }
);

// Pages that only *link* to packets shouldn't break if the packet tool's
// database is unreachable — they just show no packet links.
export async function getPacketLinks(): Promise<PacketLink[]> {
  try {
    const all = await getAllPackets();
    return all.map(p => ({ slug: p.slug, company: p.company, role: p.role, yoeBucket: p.yoeBucket }));
  } catch {
    return [];
  }
}

// Per-company counts from the company_prep_counts view (see
// supabase/add_company_prep_counts.sql). A few hundred small rows, cached
// for an hour. If the view hasn't been created yet, pages simply show no
// counts rather than erroring.
export const getPrepCounts = unstable_cache(
  async (): Promise<PrepCounts> => {
    const { data, error } = await supabaseAdmin()
      .from("company_prep_counts")
      .select("company_key,company,questions,assignments,jobs")
      .limit(5000);
    if (error || !data) return {};
    const out: PrepCounts = {};
    for (const r of data as { company_key: string; company: string; questions: number; assignments: number; jobs: number }[]) {
      out[companyKey(r.company_key)] = { company: r.company, questions: r.questions, assignments: r.assignments, jobs: r.jobs };
    }
    return out;
  },
  ["company-prep-counts"],
  { revalidate: 3600, tags: ["company-prep-counts"] }
);

import { neon } from "@neondatabase/serverless";

// Read-only client into the separate Packets Generator project's own Neon
// Postgres database — a different project/database from this app's Supabase
// instance. This app never writes to it, only reads published packets.
const sql = neon(process.env.NEON_DATABASE_URL!);

export type Track = "ACADEMY" | "DEVOPS" | "AIML" | "DSML";
export type YoeBucket = "LT2" | "B2_5" | "GT5";

export const TRACK_LABELS: Record<Track, string> = {
  ACADEMY: "Academy", DEVOPS: "DevOps", AIML: "AIML", DSML: "DSML",
};
export const YOE_LABELS: Record<YoeBucket, string> = {
  LT2: "<2 YoE", B2_5: "2-5 YoE", GT5: ">5 YoE",
};

export type PacketListItem = {
  slug: string;
  track: Track;
  company: string;
  role: string;
  yoeBucket: YoeBucket;
  publishedAt: string | null;
};

export async function getPublishedPackets(): Promise<PacketListItem[]> {
  const rows = await sql`
    select slug, track, company, role, "yoeBucket", "publishedAt"
    from "Packet"
    where status = 'PUBLISHED'
    order by "publishedAt" desc nulls last
  `;
  return rows as PacketListItem[];
}

// Used by "Request Packet" on /jobs: exact, case-insensitive match on both
// company and role — no fuzzy matching, so "Amazon" / "amazon " both hit,
// but "Amazon India" does not match a packet titled just "Amazon".
export async function findPacketByCompanyRole(company: string, role: string): Promise<{ slug: string } | null> {
  const rows = await sql`
    select slug
    from "Packet"
    where status = 'PUBLISHED'
      and lower(trim(company)) = lower(trim(${company}))
      and lower(trim(role)) = lower(trim(${role}))
    limit 1
  `;
  return rows[0] ? { slug: rows[0].slug as string } : null;
}

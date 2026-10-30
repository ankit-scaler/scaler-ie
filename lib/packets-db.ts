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

export type PacketQuestion = {
  id: string;
  order: number;
  displayText: string;
  problemLink: string | null;
  problemLinkSource: "LEETCODE" | "GFG" | "MANUAL" | null;
};

export type PacketRound = {
  id: string;
  order: number;
  name: string;
  duration: string | null;
  questions: PacketQuestion[];
};

export type PacketDetail = {
  slug: string;
  track: Track;
  company: string;
  role: string;
  yoeBucket: YoeBucket;
  publishedAt: string | null;
  rounds: PacketRound[];
};

export async function getPacketDetail(slug: string): Promise<PacketDetail | null> {
  const packets = await sql`
    select id, slug, track, company, role, "yoeBucket", "publishedAt"
    from "Packet"
    where slug = ${slug} and status = 'PUBLISHED'
  `;
  const packet = packets[0];
  if (!packet) return null;

  const [rounds, questions] = await Promise.all([
    sql`select id, "order", name, duration from "Round" where "packetId" = ${packet.id} order by "order"`,
    sql`
      select id, "roundId", "order", "displayText", "problemLink", "problemLinkSource"
      from "Question"
      where "packetId" = ${packet.id} and status = 'ACTIVE'
      order by "order"
    `,
  ]);

  const questionsByRound = new Map<string, PacketQuestion[]>();
  for (const q of questions as any[]) {
    const list = questionsByRound.get(q.roundId) || [];
    list.push({ id: q.id, order: q.order, displayText: q.displayText, problemLink: q.problemLink, problemLinkSource: q.problemLinkSource });
    questionsByRound.set(q.roundId, list);
  }

  return {
    slug: packet.slug,
    track: packet.track,
    company: packet.company,
    role: packet.role,
    yoeBucket: packet.yoeBucket,
    publishedAt: packet.publishedAt,
    rounds: (rounds as any[]).map(r => ({
      id: r.id, order: r.order, name: r.name, duration: r.duration,
      questions: questionsByRound.get(r.id) || [],
    })),
  };
}

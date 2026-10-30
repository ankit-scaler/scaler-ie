// Shared by the server pages and the client views that link between
// Questions, Assignments, Company packets and Jobs.

// Company packets open in the Packets Generator app, by slug.
export const PACKET_GENERATOR_BASE = "https://interview-experiences-packets-creat.vercel.app/p/";

// The same key the company_prep_counts view builds in SQL
// (lower(btrim(company))), plus collapsing inner whitespace, so company
// names from the sheet, the packet tool and the job boards line up.
export const companyKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

export type PrepCount = { company: string; questions: number; assignments: number; jobs: number };
export type PrepCounts = Record<string, PrepCount>; // keyed by companyKey

export type PacketLink = { slug: string; company: string; role: string; yoeBucket: "LT2" | "B2_5" | "GT5" };

export const YOE_SHORT: Record<PacketLink["yoeBucket"], string> = { LT2: "<2 yrs", B2_5: "2–5 yrs", GT5: ">5 yrs" };

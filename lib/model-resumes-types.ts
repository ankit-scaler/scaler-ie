import copy from "./model-resumes-copy.json";

// Client-safe types, facets and copy for Model Resumes. Server-only data
// access lives in lib/model-resumes.ts. No resume content is kept in the repo:
// it is loaded into Supabase from the content team's private handoff pack.

export type Program = "Academy" | "DSML" | "AIML" | "DevOps";
export type ExpBand = "fresher" | "1-4" | "5-10" | "10plus";
export type Background = "cs" | "noncs" | "same" | "different" | "switcher";

export const PROGRAMS: Program[] = ["Academy", "DSML", "AIML", "DevOps"];
export const EXP_BANDS: ExpBand[] = ["fresher", "1-4", "5-10", "10plus"];
export const BACKGROUNDS: Background[] = ["cs", "noncs", "same", "different", "switcher"];

export const COPY = copy;
export const EXP_LABELS = copy.facets.exp_band as Record<ExpBand, string>;
export const BG_LABELS = copy.facets.background as Record<Background, string>;

// Programme -> existing colour token (text-acad / text-dsml / ...).
export const PROGRAM_TEXT: Record<Program, string> = {
  Academy: "text-acad", DSML: "text-dsml", AIML: "text-aiml", DevOps: "text-devops",
};

// Fresher: CS/IT + Non-CS only. Other bands: Same / Different / Switching.
// "All" (no band chosen): all five.
export function backgroundsForBand(band: ExpBand | "All"): Background[] {
  if (band === "fresher") return ["cs", "noncs"];
  if (band === "All") return BACKGROUNDS;
  return ["same", "different", "switcher"];
}

export type ResumeCard = {
  slug: string; sort_key: number; program: Program;
  exp_band: ExpBand; exp_label: string;
  background: Background; background_label: string;
  headline: string; persona: string;
  bullets_with_numbers_pct: number; note_count: number;
};

export const CARD_COLUMNS =
  "slug,sort_key,program,exp_band,exp_label,background,background_label,headline,persona,bullets_with_numbers_pct,note_count";

// ---- one full resume (the annotated reader page) ----
export type Bullet = { id: string; text: string };
export type Entry = { title: string; stack: string[]; dates: string | null; org_hidden: boolean; bullets: Bullet[] };
export type ResumeBody = { work: Entry[]; projects: Entry[]; education: string[]; skills: string[]; achievements: string[] };
export type NoteKind = "strong" | "star" | "contrast" | "tip";
export type Note = {
  id: string; number: number; kind: NoteKind; title: string; body: string;
  target: { bullet_id?: string; entry?: string; section?: string };
  star?: { k: "S" | "T" | "A" | "R"; text: string }[];
  weaker?: string; rules?: string[];
};
export type Rule = { id: string; kind: "do" | "dont"; text: string };
export type ResumeFull = {
  slug: string; program: Program; exp_label: string; background_label: string;
  headline: string; persona: string; recruiters: string[];
  resume: ResumeBody; rules: Rule[]; notes: Note[];
};
export const FULL_COLUMNS =
  "slug,program,exp_label,background_label,headline,persona,recruiters,resume,rules,notes";

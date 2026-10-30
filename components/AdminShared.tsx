export const ACCENTS = {
  acad:   { bar: "bg-acad",   text: "text-acad" },
  dsml:   { bar: "bg-dsml",   text: "text-dsml" },
  aiml:   { bar: "bg-aiml",   text: "text-aiml" },
  devops: { bar: "bg-devops", text: "text-devops" },
  topic:  { bar: "bg-topic",  text: "text-topic" },
} as const;
export type Accent = keyof typeof ACCENTS;

export function SectionLabel({ children, accent = "acad" }: { children: React.ReactNode; accent?: Accent }) {
  const a = ACCENTS[accent];
  return (
    <div className="flex items-center gap-2.5 pt-2">
      <span className={`h-4 w-1.5 rounded-full ${a.bar}`} />
      <h2 className="font-display text-2xl font-bold leading-none">{children}</h2>
    </div>
  );
}

export function Stat({ label, value, accent = "acad" }: { label: string; value: number | string; accent?: Accent }) {
  const a = ACCENTS[accent];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-edge bg-panel p-5 shadow-card">
      <div className={`absolute inset-x-0 top-0 h-[3px] ${a.bar}`} />
      <div className={`font-mono text-[11px] font-bold uppercase tracking-widest ${a.text}`}>{label}</div>
      <div className="mt-1 font-display text-4xl">{typeof value === "number" ? value.toLocaleString() : value}</div>
    </div>
  );
}
export function Card({ title, children, accent = "acad", action }: { title: string; children: React.ReactNode; accent?: Accent; action?: React.ReactNode }) {
  const a = ACCENTS[accent];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-edge bg-panel p-5 shadow-card">
      <div className={`absolute inset-x-0 top-0 h-[3px] ${a.bar}`} />
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className={`font-mono text-xs font-bold uppercase tracking-widest ${a.text}`}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

export type Tone = "acad" | "dsml" | "aiml" | "devops" | "topic";

// Static class strings so Tailwind's content scan keeps them.
const TONE: Record<Tone, string> = {
  acad:   "bg-acad/10 text-acad",
  dsml:   "bg-dsml/10 text-dsml",
  aiml:   "bg-aiml/10 text-aiml",
  devops: "bg-devops/10 text-devops",
  topic:  "bg-topic/10 text-topic",
};

export default function Monogram({ name, tone = "acad" }: { name: string; tone?: Tone }) {
  const letter = (name.trim()[0] || "?").toUpperCase();
  return (
    <span
      aria-hidden
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full font-display text-[15px] font-bold ${TONE[tone]}`}
    >{letter}</span>
  );
}

import { PACKET_GENERATOR_BASE, PacketLink, YOE_SHORT, companyKey } from "@/lib/prep-shared";

// Shown above Questions/Assignments results once a company is picked and
// that company has a published prep packet — the step learners most often
// miss is that a packet exists at all.
export default function PacketBanner({ company, packets }: { company: string; packets: PacketLink[] }) {
  if (company === "All") return null;
  const key = companyKey(company);
  const mine = packets.filter(p => companyKey(p.company) === key);
  if (mine.length === 0) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-acad/30 bg-acad/10 px-4 py-3 text-sm">
      <span className="text-text">
        <span className="font-medium">{mine[0].company}</span> has {mine.length === 1 ? "a prep packet" : `${mine.length} prep packets`}:
      </span>
      {mine.slice(0, 4).map(p => (
        <a
          key={p.slug}
          href={`${PACKET_GENERATOR_BASE}${p.slug}`}
          target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-acad underline-offset-4 hover:underline"
        >
          {p.role} · {YOE_SHORT[p.yoeBucket]}
          <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden><path d="M7 3h10v10h-2V6.4L4.7 16.7 3.3 15.3 13.6 5H7V3z"/></svg>
        </a>
      ))}
      {mine.length > 4 && (
        <a href={`/company-packets?company=${encodeURIComponent(mine[0].company)}&ref=banner`} className="text-mute underline-offset-4 hover:text-text hover:underline">
          All {mine.length} →
        </a>
      )}
    </div>
  );
}

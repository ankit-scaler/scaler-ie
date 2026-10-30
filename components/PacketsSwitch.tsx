import Link from "next/link";

// One "Packets" tab covers two pages: company packets (/company-packets)
// and the role × YoE guides (/packets) to fall back on when a company has
// no packet yet. This switch sits at the top of both.
export default function PacketsSwitch({ current }: { current: "company" | "role" }) {
  const item = (href: string, label: string, on: boolean) => (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`rounded-full px-4 py-1.5 text-sm transition-colors duration-200 ${
        on ? "bg-text text-ink" : "text-mute hover:text-text"
      }`}
    >{label}</Link>
  );
  return (
    <div className="inline-flex rounded-full border border-edge bg-panel p-1">
      {item("/company-packets", "Company packets", current === "company")}
      {item("/packets", "Role guides", current === "role")}
    </div>
  );
}

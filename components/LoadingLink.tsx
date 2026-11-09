"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlightSpinner } from "./FlightLoader";

type Props = Omit<React.ComponentProps<typeof Link>, "href"> & { href: string; spinnerClassName?: string };

// next/link with instant click feedback: shows a spinner and blocks repeat
// clicks until the route changes. (Next 14 has no useLinkStatus.)
export default function LoadingLink({ href, onClick, className = "", spinnerClassName = "", children, target, ...rest }: Props) {
  const path = usePathname();
  const [pending, setPending] = useState(false);

  // Navigation finished -> clear.
  useEffect(() => { setPending(false); }, [path]);

  // Safety net: never leave a link stuck if navigation is cancelled/fails.
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(false), 10000);
    return () => clearTimeout(t);
  }, [pending]);

  const samePage = href.split(/[?#]/)[0] === path;
  const external = /^https?:\/\//i.test(href) || target === "_blank";

  return (
    <Link
      {...rest}
      href={href}
      target={target}
      aria-busy={pending || undefined}
      className={`${className} ${pending ? "pointer-events-none opacity-70" : ""}`}
      onClick={e => {
        if (pending) { e.preventDefault(); return; }
        onClick?.(e);
        const modified = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
        if (!modified && !external && !samePage && !e.defaultPrevented) setPending(true);
      }}
    >
      {children}
      {pending && <FlightSpinner className={`relative z-10 ml-2 inline-block h-3.5 w-3.5 align-middle ${spinnerClassName}`} />}
    </Link>
  );
}

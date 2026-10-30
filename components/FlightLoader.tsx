"use client";

export function FlightSpinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`h-6 w-6 animate-spin rounded-full border-2 border-edge border-t-acad ${className}`}
      aria-hidden
    />
  );
}

export default function FlightLoader({ label }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-ink">
      <div className="flex flex-col items-center gap-4">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-edge border-t-acad" aria-hidden />
        <div className="font-mono text-[11px] uppercase tracking-widest text-mute">
          {label || "Loading"}
        </div>
      </div>
    </div>
  );
}

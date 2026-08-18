"use client";
import { useEffect, useState } from "react";

const CAPTIONS = ["Boarding…", "Taxiing to runway…", "Cleared for takeoff…", "Climbing…"];

function Plane747({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 70" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* tail fin, swept back */}
      <path d="M36 40 C32 40.5 28 40 26 39 L16 10 C15.3 8 16.5 6.5 18.5 7 L38 36 Z" fill="rgb(var(--mute))" />
      {/* main wing, swept back beneath fuselage */}
      <path d="M100 58 L146 69 C149 69.7 148.3 70.6 145.3 70.1 L96 61.5 Z" fill="rgb(var(--mute))" />
      {/* small tailplane */}
      <path d="M42 39 L22 32.5 C20.5 32 20.5 31 22.5 31 L44 36.5 Z" fill="rgb(var(--mute))" opacity=".8" />
      {/* fuselage + upper-deck hump, one continuous silhouette — the 747's signature profile */}
      <path
        d="M18 42
           C18 37 26 34 40 32.5
           C58 30.5 76 29.5 92 29
           C95 20.5 109 14.5 126 15
           C139 15.4 150 20 154 27
           C155.4 29.5 154.6 30.8 151.5 30.8
           C168 32.2 188 36 200 41
           C207.5 44 212 46.5 212 48.5
           C212 50.4 207.5 52.3 200 54.5
           C186 58.5 158 61.5 122 62.5
           C88 63.4 54 62.4 32 59.5
           C22.5 58.2 18 47.5 18 42 Z"
        fill="rgb(var(--text))"
      />
      {/* cockpit window */}
      <rect x="196" y="43" width="7" height="3.4" rx="1.3" fill="rgb(var(--ink))" opacity=".55" />
      {/* cabin window strip */}
      <rect x="46" y="41.5" width="140" height="1.6" rx="0.8" fill="rgb(var(--ink))" opacity=".3" />
      {/* upper-deck window strip */}
      <rect x="98" y="23.5" width="44" height="1.4" rx="0.7" fill="rgb(var(--ink))" opacity=".3" />
      {/* engines */}
      <rect x="84" y="55" width="16" height="7" rx="3.4" fill="rgb(var(--mute))" />
      <rect x="120" y="58" width="15" height="6.5" rx="3.2" fill="rgb(var(--mute))" />
    </svg>
  );
}

export function FlightSpinner({ className = "" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ width: 72, height: 34 }} aria-hidden>
      <div className="absolute inset-x-0 bottom-1 h-px bg-edge" />
      <div className="flight-taxi absolute bottom-1 left-0" style={{ width: 34 }}>
        <Plane747 className="h-[11px] w-[34px]" />
      </div>
      <style jsx>{`
        .flight-taxi { animation: flight-taxi-loop 1.6s ease-in-out infinite; }
        @keyframes flight-taxi-loop {
          0%   { transform: translateX(0); }
          50%  { transform: translateX(38px); }
          100% { transform: translateX(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .flight-taxi { animation: none; }
        }
      `}</style>
    </div>
  );
}

export default function FlightLoader({ label }: { label?: string }) {
  const [caption, setCaption] = useState(CAPTIONS[0]);
  useEffect(() => {
    let i = 0;
    const iv = setInterval(() => { i = (i + 1) % CAPTIONS.length; setCaption(CAPTIONS[i]); }, 1400);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-ink">
      <div className="flex flex-col items-center">
        <div className="relative h-40 w-64 overflow-hidden sm:h-48 sm:w-80">
          {/* sky trail dots */}
          <div className="flight-trail absolute h-1 w-1 rounded-full bg-acad/60" />
          {/* runway */}
          <div className="absolute inset-x-0 bottom-8 h-px bg-edge" />
          <div className="flight-runway absolute inset-x-0 bottom-8 flex gap-6">
            {Array.from({ length: 10 }).map((_, i) => (
              <span key={i} className="h-px w-6 shrink-0 bg-mute/50" />
            ))}
          </div>
          {/* plane */}
          <div className="flight-plane absolute bottom-8 left-0">
            <Plane747 className="h-8 w-[100px] sm:h-9 sm:w-[113px]" />
          </div>
        </div>
        <div className="mt-2 font-mono text-[11px] uppercase tracking-widest text-mute">
          {label || caption}
        </div>
      </div>

      <style jsx>{`
        .flight-plane {
          animation: flight-path 3.2s cubic-bezier(.45,0,.55,1) infinite;
        }
        .flight-runway {
          animation: flight-runway-scroll 3.2s linear infinite;
        }
        .flight-trail {
          left: 8%;
          bottom: 32px;
          animation: flight-trail-fade 3.2s cubic-bezier(.45,0,.55,1) infinite;
        }
        @keyframes flight-path {
          0%   { transform: translate(0, 0) rotate(0deg); }
          55%  { transform: translate(48%, 0) rotate(0deg); }
          78%  { transform: translate(72%, -14px) rotate(-10deg); }
          100% { transform: translate(150%, -120px) rotate(-16deg); opacity: 0; }
        }
        @keyframes flight-runway-scroll {
          0%   { transform: translateX(0); opacity: 1; }
          55%  { transform: translateX(-40%); opacity: 1; }
          78%  { opacity: .4; }
          100% { transform: translateX(-70%); opacity: 0; }
        }
        @keyframes flight-trail-fade {
          0%, 55% { opacity: 0; transform: scale(1); }
          78% { opacity: .8; }
          100% { opacity: 0; transform: scale(2.4) translate(120%, -160%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .flight-plane, .flight-runway, .flight-trail { animation: none; }
        }
      `}</style>
    </div>
  );
}

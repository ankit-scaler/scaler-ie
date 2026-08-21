"use client";
import { useEffect, useRef } from "react";

// Reads the app's own accent colors (CSS vars are "R G B", set per-theme in
// globals.css) so this stays on-brand instead of introducing new colors.
const ACCENT_VARS = ["--acad", "--dsml", "--aiml", "--devops"];

// Deterministic (fixed seed): rest positions are stable across renders —
// only the live x/y (nudged by the cursor) ever changes.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Dot = { restX: number; restY: number; x: number; y: number; size: number; colorIdx: number; opacity: number };

export default function InteractiveConfetti({ count = 70 }: { count?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const style = getComputedStyle(document.documentElement);
    const colors = ACCENT_VARS.map(v => {
      const rgb = style.getPropertyValue(v).trim().split(/\s+/).join(",");
      return `rgb(${rgb})`;
    });

    const rand = mulberry32(42);
    const dots: Dot[] = Array.from({ length: count }, () => {
      const angle = rand() * Math.PI * 2;
      const edgeBias = Math.sqrt(rand()); // denser toward the edges than dead center
      const radius = 0.12 + edgeBias * 0.68;
      return {
        restX: Math.min(0.98, Math.max(0.02, 0.5 + Math.cos(angle) * radius)),
        restY: Math.min(0.96, Math.max(0.04, 0.5 + Math.sin(angle) * radius * 0.9)),
        x: 0, y: 0,
        size: 2 + rand() * 5,
        colorIdx: Math.floor(rand() * colors.length),
        opacity: 0.25 + rand() * 0.45,
      };
    });

    let w = 0, h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const rect = container.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dots.forEach(d => { d.x = d.restX * w; d.y = d.restY * h; });
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // Tracked on window (not this element) so hovering interactive content
    // in front of the dots — the sign-in button, the logo — still moves
    // them; this layer itself stays pointer-events-none the whole time.
    let mouseX = -9999, mouseY = -9999;
    const onMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    };
    const onLeave = () => { mouseX = -9999; mouseY = -9999; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);

    const REPEL_RADIUS = 120;
    const REPEL_STRENGTH = 46;
    const EASE = 0.08;
    let raf = 0;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const d of dots) {
        const restXpx = d.restX * w, restYpx = d.restY * h;
        if (reduceMotion) {
          d.x = restXpx; d.y = restYpx;
        } else {
          let targetX = restXpx, targetY = restYpx;
          const dx = restXpx - mouseX, dy = restYpx - mouseY;
          const dist = Math.hypot(dx, dy);
          if (dist < REPEL_RADIUS && dist > 0.01) {
            const force = (1 - dist / REPEL_RADIUS) * REPEL_STRENGTH;
            targetX = restXpx + (dx / dist) * force;
            targetY = restYpx + (dy / dist) * force;
          }
          d.x += (targetX - d.x) * EASE;
          d.y += (targetY - d.y) * EASE;
        }
        ctx.beginPath();
        ctx.globalAlpha = d.opacity;
        ctx.fillStyle = colors[d.colorIdx];
        ctx.arc(d.x, d.y, d.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
    };
  }, [count]);

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}

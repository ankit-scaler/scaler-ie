# Design tokens — Direction A "Refined" (approved 2026-11-09)

Colors/fonts are unchanged and live in `app/globals.css` + `tailwind.config.ts`
(ink, panel, panel2, edge, edge-strong, text, mute, acad, dsml, aiml, devops, topic;
Sora display, Inter body, JetBrains Mono labels). Light/dark follows system with a toggle.

## Rules introduced
- **Nav (≥1440px):** four main tabs in a segmented container (`rounded-full bg-panel2 p-1`), icon + label, active = `bg-panel` pill with soft shadow. "Open Hirings" / "Revise with Crash Course" are outlined accent pills. Never scrolls.
- **Nav (<1440px):** single "Menu" button opening a dropdown of all links (closes on outside click, Esc, route change).
- **Cards:** no top accent bar. Header = `Monogram` (first letter, tinted circle) + company/role in display font; one program dot + label; neutral tags for round/program; footer for topic.
- **Primary button:** `bg-acad text-ink` (readable in both themes), `min-h-10`, `rounded-xl`. Secondary: `bg-panel2` with `border-edge`.
- **Loading:** every navigation link uses `LoadingLink` (spinner, blocks repeat clicks). On filled buttons pass `spinnerClassName="!border-ink/30 !border-t-ink"`.
- Shapes: cards `rounded-2xl`, buttons `rounded-xl`, chips `rounded-full`.

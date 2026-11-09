# Decisions log

## 2026-11-09: Click-feedback loader via custom LoadingLink
- Decision: added components/LoadingLink.tsx (wraps next/link; spinner + blocks repeat clicks until pathname changes, 10s safety timeout). Used in Header, PacketsView, PacketReader, VideoResourcesReader.
- Reason: Next 14.2.13 has no useLinkStatus; users saw no feedback on slow server-rendered routes.
- Rejected: upgrading Next for useLinkStatus (out of scope); spinners on external/new-tab links (opens instantly, misleading).

## 2026-11-09: Slack digest moved to its own 6 PM IST job, last 3 IST days
- Decision: new sync/daily_digest.py + .github/workflows/daily-digest.yml (cron 12:30 UTC). Removed the digest from sync_sheet.py / daily-sync.yml. Shows unique visitors per IST date for today (so far) + 2 previous days; buckets by each row's started_at in IST.
- Reason: old digest counted "today so far" at run time, but the 23:00 IST job ran ~2:40 AM, so it counted only the first hours of the next day (22 vs ~81 on the site).
- Rejected: just shifting the window to "yesterday" (still run-time dependent); keeping it in sync_sheet.py (needs Sheets creds at import, can't run on its own schedule).
- Also: Tracking chart renamed "Daily Visits (Opened App)".

## 2026-11-09: Jobs feed narrowed to software/data/AI roles
- Decision: sync/sync_jobs.py is_relevant_title now requires a core tech signal (CORE_TECH: software/SDE/developer/backend/data/ML/AI/devops...) instead of the bare word "engineer"; denylist of non-tech disciplines + enterprise-suite stacks; drops Director/VP/Head/Principal/Distinguished; keeps bare "Engineering Manager", technical Program Managers, and Product Managers.
- Reason: "engineer"/"engineering manager" matched mechanical, purchase, chip-design, automotive etc. Probe of one city x 8 searches: 119 distinct titles passed before, 84 after (all reviewed as tech).
- Rejected: description-based filtering (not stored/scraped); keeping all program/product managers.
- Existing DB rows are swept by prune_irrelevant on the next jobs sync run.

## 2026-11-09: Jobs: nightly last-24h scrape, DB keeps Today/Today-1/Today-2 (IST)
- Decision: sync_jobs.py HOURS_OLD=24 (append via upsert); prune by date_posted < Today-2 (IST), fallback synced_at for rows without a date. Jobs page cutoff and filter ("Last 2 days" replaces "Last 7 days") match.
- Reason: user wants only the freshest jobs; synced_at-based pruning let rows live past their real age.
- Note: job_applies.job_id has no FK, so apply history survives pruning. A skipped/blocked night is not back-filled.

## 2026-11-09: UI refresh — Direction A "Refined" + non-scrolling nav
- Decision: Monogram-based cards (Questions, Assignments, Packets), filled primary buttons, segmented icon nav at >=1440px, "Menu" dropdown below. Header highlight pills lose their icons at wide size to fit.
- Reason: cards had four competing colored pills and flat buttons; user wanted no nav scrolling.
- Why 1440px not 1280px: estimated full-nav width is ~1380px; a lower breakpoint would clip. Unmeasured — verify in browser; lower the `min-[1440px]` in Header.tsx if it fits sooner.
- Rejected: directions B (dense grid) and C (glass/glow); icons-only and wrap-to-two-rows nav.
- Not changed: Filters, Jobs and Company Packets cards (follow-up for consistency).

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

## 2026-11-11: Heartbeat throttled to protect Vercel free-tier Active CPU
- Decision: components/Heartbeat.tsx beats only while the tab is visible, every 90s (was 30s, even when hidden), with a 20s minimum gap.
- Reason: Vercel emailed 90% of the 4h Fluid Active CPU free tier (team-wide, resets monthly); every beat is a function call. Hidden tabs left open were beating all day.
- Effect to expect: far fewer /api/heartbeat calls; session "duration/minutes" metrics no longer include time in hidden tabs (arguably more accurate), 90s granularity.
- Not done (candidates): admin stats row cap, Questions page payload.

## 2026-11-11: Heartbeat timer removed; visit ping only; time tracking dropped
- Decision: components/Heartbeat.tsx no longer repeats. One ping when a tab is visible, and again only on becoming visible after >5 min (server session window). Background tabs send nothing. Removed all time/minutes/duration displays from the Tracking page, its CSV, and the tracking-sheet subsheets (Usage Summary, Daily Visits).
- Reason: Vercel 90% free-tier Fluid Active CPU warning; the timer was the biggest recurring invocation source. sessions rows are still needed for Daily Visits, Slack digest and unique visitors, so visits are still recorded.
- Rejected: removing /api/heartbeat entirely (would stop sessions data).
- /api/heartbeat route unchanged; duration_sec now ~0 and ignored.

## 2026-11-11: Questions list loaded by the browser in versioned chunks
- Decision: app/page.tsx no longer renders all ~13k questions. It sends a manifest (version + chunk count); components/QuestionsLoader.tsx fetches `/api/questions/[chunk]?v=<version>` (2,000-row id ranges, 2 at a time) and the browser keeps each chunk (`private`, 1 day; 1 hour before the migration). Version = newest `questions.updated_at` + row count + newest id, re-checked at most once a minute; a trigger moves `updated_at` only when a row's content changes (supabase/add_questions_updated_at.sql). Server caches are keyed by version, so nothing is ever invalidated by tag. A chunk request for an old version gets 409 with the current manifest and the loader switches to it. The last list stays in memory for in-app navigation back to Questions.
- Reason: Vercel 90% Fluid Active CPU warning. Each Questions visit rendered ~5 MB (~100 ms CPU measured locally), and Next skips data-cache entries over 2 MB, so even the Supabase read was never cached.
- Rejected: a stamp table moved by the sync and Admin (missed edits made straight in Supabase, sync crashes, and needed error handling at every writer); `immutable`/1-year browser caching (stale if the version ever failed to move); row-offset chunks (rows shift when the sync inserts/deletes mid-read); per-programme files (default view is "All", and Vercel's ~4.5 MB response limit).
- Tradeoff: Questions is no longer server-rendered. A cold first visit shows a spinner while chunks load; repeat visits read from browser cache or memory. See PR #8 for the local measurements.
- Also: Header asks /api/admin/stats?check=1 once per tab session (a no expires after 10 min) instead of twice per page load.

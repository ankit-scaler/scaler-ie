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

## 2026-11-12: Request Packet no-match now goes to a Typeform
- Decision: the Request Packet modal asks only Company + Role. Match -> show packet link (unchanged). No match -> "Open request form" button linking to https://interviewbit.typeform.com/to/EoyLKy6w (new tab). /api/request-packet no longer posts to Slack or inserts into packet_requests.
- Reason: Typeform is now the team's request channel; JD/date/contact are collected there.
- Rejected: auto-opening the tab after the async check (popup blockers); keeping Slack/DB logging alongside (learner would fill details twice).
- Left in place, now unused: packet_requests table, SLACK_PACKET_REQUESTS_WEBHOOK_URL env var. Typeform hidden-field prefill (company/role) not added.

## 2026-11-12: Tracking numbers computed in SQL; raw reads paginated; loader/race fixes
- Problem: /api/admin/stats pulled raw rows with .limit(20000), but Supabase caps a request at ~1000 rows. 7d (~3k sessions) and 30d (7,158 sessions) were silently truncated in arbitrary order, so 7d and 30d charts disagreed (e.g. 11-10 = 0 vs ~50). Query errors also became zeros (`data || []`).
- Decision: (1) new SQL function admin_daily_activity (supabase/add_admin_daily_activity.sql) returns one row per IST day; charts and all stat tiles use it. (2) Raw rows for tables/CSV/learner lookup are read in pages of 1000 by id with dedupe; failures or a 50k safety cap surface as warnings in the UI. (3) Page ignores out-of-order responses, dims stale data with a loader, disables range buttons while loading. (4) Charts use straight lines.
- Rejected: separate daily_visits table (extra write per ping = more Vercel CPU, needs backfill, only covers one chart); pagination only (every 30d load would pull thousands of rows).
- If the migration hasn't been run: charts fall back to counting loaded rows and a warning says to run it.
- Audit: no other user-facing query hits the cap (other tables are small; sheet sync and Slack digest already page).

## 2026-11-13: Scheduled jobs triggered by Supabase pg_cron (workflow_dispatch), not GitHub cron
- Problem: GitHub `schedule:` runs were 7-10h late (Slack digest at 1-4 AM IST instead of 6 PM). A late digest also skipped feedback, because it only looked at the current IST day.
- Decision: pg_cron jobs gh-daily-digest (30 12 UTC), gh-daily-sync (30 17), gh-daily-jobs-sync (0 18) call public.trigger_gh_workflow(), which POSTs workflow_dispatch to GitHub via pg_net using a fine-grained token (Actions r/w, repo scaler-ie only) kept in Supabase Vault (secret github_actions_token). The `schedule:` blocks were removed from the three workflows. Weekly cron-log-cleanup job trims cron.job_run_details to 14 days. Digest feedback window is now the rolling last 24h.
- Rejected: porting the Python to SQL (sheet/jobs syncs need Google API/scraping anyway); Vercel Cron (Hobby only fires somewhere within the hour, costs Fluid CPU); external pinger (third-party service + token).
- Operational notes: the token expires (set a reminder, 1 year max) - an expired token makes jobs silently not start (pg_cron still shows "succeeded"; check net._http_response for 401). If Actions is down at fire time that day's run is skipped; no retry.

## 2026-11-13: Questions/Assignments Role and Round filters become searchable multi-selects
- Decision: Role (both pages) and Round (Questions) use a new MultiSelect in components/Filters.tsx: search box, checkbox list, "Select all N" (adds all options matching the search), Clear. FilterState.role/round are string[] (empty = All). URL uses repeated params (?role=A&role=B); legacy ?role=A still loads. Cascade kept: roles scoped by company, rounds by company + selected roles; removing a role drops rounds that no longer apply. Company and Topic stay single-select.
- Tracking: /api/track search events fire only when exactly one role is selected, so multi-role browsing doesn't inflate "searched" counts.
- Rejected: one tracking event per selected role (inflates counts); comma-joined URL param (role names can contain commas); applying to Company/Topic (not requested).

## 2026-11-18: Nav bar becomes a floating pill; Resume added
- Decision: components/Header.tsx. Centered floating pill (Questions, Assignments, Trending roles, Packets, Resume + "New" tag) at >=1360px; Crash Course ghost pill and Open Hirings icon sit in the right cluster. Below 1360px one Menu button lists all 7 destinations with a one-line hint, active highlight and aria-current. Same tokens/colors as before; "Prepare for Trending roles" is shortened to "Trending roles" in the pill only (full name as tooltip and in the menu).
- Resume points to RESUME_HREF = "/resume" (page not built yet - 404 until it exists). Change that one constant when the route/URL is final.
- Breakpoint moved from 1440px to 1360px after estimating widths (5 tabs + New tag + right cluster); verify visually.
- Rejected: sidebar rail, grouped menus, dock, command bar (see the five concept artifacts); a new accent colour for "New" (kept the existing acad token).

## 2026-11-18: Model Resumes section (/resumes, /resumes/[slug])
- Decision: built from the content team's handoff pack (README + screens as spec). Floating-pill nav kept (pack's "Interview prep" dropdown not used); nav item "Resumes" -> /resumes.
- Data: Supabase tables model_resume + model_resume_event (supabase/add_model_resumes.sql = the pack's schema plus a generated note_count column so the list page never downloads notes). Content/PDFs are NOT in the repo (public repo): loaded by the pack's db/load_model_resumes.py; handoff folder excluded locally via .git/info/exclude.
- Reads: session check, then unstable_cache (1h) over the service client, same pattern as company-packets, to keep Vercel CPU and Supabase egress low (egress is ~2.7 of 5 GB). After re-loading content, changes appear within an hour. RLS policies stay as defence in depth.
- PDFs: private bucket model-resumes; /api/model-resumes/pdf returns a 5-minute signed URL as JSON (pack said redirect; JSON lets the button show a busy state). MODEL_RESUME_PDF=off hides the button and 404s the route.
- Events (model_resume_event) are inserted from the browser under the learner's own session: no Vercel function call.
- Paper and note cards stay white in both themes via scoped .rp-* CSS in globals.css (spec requirement; deliberate exception to tokens-only).
- Not built: the prototype's extra "lens" controls (note-kind filter, rules dropdown, step buttons) - absent from README and screenshots; admin Tracking charts for the new events.
- Open: real Scaler dashboard URL (placeholder in lib/model-resumes-copy.json); PDF on/off at launch.

## 2026-11-18: Nav grouped as Learn | Career pills; Hiring moved into the Career pill
- Decision: components/Header.tsx. Two pills at >=1360px: Learn (Questions, Assignments, Trending roles, Packets) and Career (Resumes NEW, Hiring). Hiring uses the hiring.png icon plus a blinking red dot; the old red dot next to "Interview Vault" is removed so Hiring is the only blinking element. Below 1360px the pills fold into Menu and Hiring stays visible as a compact icon + dot (label from sm up). Scaler wordmark replaced by the Scaler Academy icon.
- Reason: group by purpose (prepare vs get the job); Resumes and Hiring are neighbours; the icon-only Hiring button was easy to miss.
- Rejected: Hiring inside one pill (6 tabs, mixes prepare and apply), filled CTA on the right (competes with Crash Course), chip beside the logo (see the placement artifact).
- Check: total width at 1360-1440px was estimated, not measured.

## 2026-11-18: Resumes tracking in the Tracking page and the tracking sheet
- Decision: read-side only; the learner app already records everything in model_resume_event. Stats API (app/api/admin/stats/route.ts) adds `resumeEvents` (embedded model_resume gives a readable "Programme · Experience · Background" name). Tracking page gets a "Resumes" section: 6 stat tiles + 5 tables (who opened what; clicks on resumes; filters applied; who downloaded; who clicked Book a resume review), each with search + CSV export, and resume events join Learner Lookup. sync/sync_sheet.py writes the same five tables as 10 tabs (Resume Opens / Clicks / Filters / Downloads / Review Clicks x All time / Last 30d) in its own try block so a problem there can't stop the existing tabs.
- Shared logic: lib/resume-tracking.ts (pure TS) and build_resume_* in sync_sheet.py are twins with identical grains, columns, labels and ordering; validated by running both on one synthetic event set and diffing every row (identical).
- Internal @scaler.com accounts are excluded like everywhere else in Tracking, so their test clicks appear in the table but not in the page or sheets.
- Rejected: daily-unique charts and an SQL function (volumes are small), changing what the learner app records.

## 2026-11-18: Heartbeat off Vercel; Trending roles page visits; Tracking page clarity
- Heartbeat: components/Heartbeat.tsx now inserts the `sessions` row straight from the browser into Supabase under the learner's own login (existing RLS policy "own sessions rw"), so the visit ping needs no Vercel function and no Fluid Active CPU (it was ~2K calls / 12h, each = auth + select + update/insert). Gate: one visit per 5 min per browser, kept in localStorage (survives reloads, shared across tabs); logic lives in lib/visit-ping.ts (dependency-injected, 13 Node test cases). If the direct insert fails, it falls back once to the unchanged /api/heartbeat route, so visit tracking cannot silently stop. Daily Visits, the Slack digest, "last active" and the sheet all still read sessions.started_at. Trade-off: no server-side 5-minute dedupe, so one person on two devices can log two rows (unique-per-day numbers unaffected).
- Trending roles page visits: PacketsView records a `page_views` row with path "/packets" (lib/track-client.ts, direct browser insert, /api/track as fallback). Tracking page: tile + "Who opened the Trending roles page" table + CSV; sheet tab "Trending Roles Visits (All time / Last 30d)" (build_page_visits twin of lib/page-visit-tracking.ts, diffed row by row).
- Tracking page clarity: sections renamed and ordered like the nav (Trending roles now holds page visits + packets + video links; "Company Packets" became "Packets"), one-line "what is counted" note under every section heading, jump-links bar, chart titles renamed. Explicitly NOT tracked and now stated on the page: scroll depth inside a packet, and video watch time (videos open on external sites).
- Rejected for now: scroll-to-end tracking on packets (needs a new table + RLS; user did not select it); moving the other /api/track* routes off Vercel (same trick, tiny volumes); the /api/admin/stats?check=1 call in the header (separate saving).

## 2026-11-18: Questions read cached in 1000-row chunks, 6 h (was one 5-min entry that could not be stored)
- Problem: pg_stat_statements showed the Questions read as ~80% of all Supabase DB time (27,159 calls x ~132 ms; each full read = 1 count + 14 paged queries for 13,189 rows) and likely most of the 2.7 / 5 GB egress. app/page.tsx cached the whole result with unstable_cache(revalidate 300), but the data is ~3.1 MB raw (~4.5 MB JSON) and Vercel's Data Cache refuses any single item over 2 MB, so the cache most likely stored nothing and every page load re-queried Supabase. (Raw size measured by the user: 3,189 KB. The "over 2MB" log line was not checked.)
- Decision: new cachedPagedRows() in lib/paged-fetch.ts caches the count and each 1000-row page as separate entries (~350 KB each), merged and de-duplicated by id (lib/chunk-utils.ts, 9 Node tests). Revalidate 6 h with tag "questions"; app/api/admin/questions POST calls revalidateTag("questions") so an admin topic fix shows immediately. New questions from the nightly sync (23:00 IST) appear within 6 h of the next request. Errors throw (nothing cached) instead of returning a short list.
- Known limit: pages are cached together, but if one page were cached just before a row was added and its neighbour just after, one row can be missing until the next refresh (tested and documented). Offset paging is kept because bigserial ids have large gaps (every upsert batch consumes ids), so id-range chunks would be mostly empty.
- Rejected: gzip/compress to fit one entry (CPU cost, still near the limit as data grows); server-side filtering/paging of the Questions page (bigger change to filtering UX, adds function calls per filter change); caching assignments/jobs this way (each <1 MB, already cacheable).
- Not changed: every page load still sends all rows to the browser (~0.8 s Vercel CPU on "/"). The per-page-load Supabase Auth lookup in middleware (634K `users` queries) is a separate saving.

## 2026-11-18: Questions cache is keyed by the nightly sync's "last synced" time
- Problem: even with the chunked 6 h cache, learners kept the old copy after the nightly sync until the timer ran out and a visit triggered a refresh (first or second visit the next morning).
- Decision: sync/sync_sheet.py writes `questions_synced_at` into a new tiny table `sync_meta` (supabase/add_sync_meta.sql, RLS on, no policies = service key only) after the Questions step (upsert, optional delete, classification). lib/sync-version.ts reads that one value (cached 60 s, at most ~1 tiny query a minute) and app/page.tsx puts it in the cache key (questionsCacheKey in lib/chunk-utils.ts). New sync time = new key = fresh read on the first visit after the sync (one visitor waits ~0.5-1.5 s, estimated); everyone else hits the cache. The 6 h TTL and revalidateTag("questions") on admin edits stay as the safety net. If the table/row is missing or unreadable the key is "...:none" and behaviour is the previous 6 h timer; the Python write is wrapped so a missing table never fails the sync.
- Rejected: a revalidate webhook the sync calls (needs a new shared secret on GitHub + Vercel); a plain 1-2 h timer (still a delay after the sync); detecting change via count/max(id) (misses updates to existing rows; bigserial ids have gaps).
- Applies to Questions only. Assignments and jobs are small, cacheable as-is, 5-minute TTL.
- Cost: one extra DB write per night; the marker is written on every sync run, so the Questions cache refreshes once per night (~15 DB calls) even if nothing changed.

## 2026-11-18: Tracking sheet brought in line with the Tracking page (IST, same filters, missing tabs)
- Audit found: (a) every sheet date/time was UTC (the old `_fmt_ts` sliced the UTC string) while the app and the stated rule are IST, so a 1 AM IST visit landed on the previous date; "Last 30d" was cut at UTC now-30d; (b) the "Company & Role" tab mixed in Assignments searches (the app uses Questions searches only, path "/"); (c) 7 tables the app exports were not in the sheet.
- Decision: sync/sync_sheet.py converts all timestamps to IST (fixed +05:30, no DST) and labels time columns "(IST)"; "Last 30d" starts at IST midnight 29 days ago (= the app's 30D); Company & Role filters path "/"; new tabs per window: Daily Visitors Unique, Daily Searches, Daily Content Engagement, Open Hirings Visits, Open Hirings Apply Clicks, Company Packets Visits, Company Packets Opens (own try block, cannot block the other tabs). "Daily Visits" stays as every raw visit but in IST.
- Parity is testable: the app's pure daily helpers moved from components/AdminTracking.tsx to lib/tracking-tables.ts (same behaviour; tie-breaks now ordinal and include item/type so ordering is deterministic and identical in Python). Validated: IST conversion and 30d window vs JavaScript's own timezone engine (2,014 timestamps + 304 windows, 0 mismatches), and all 7 new tables TS vs Python row by row on an edge-case set (IST midnight, year rollover, mixed-case emails, repeat clicks, assignments search vs questions search).
- Not changed: the app CSV headers (their times are the admin's local time, IST in practice); CSV email sort for mixed-case emails is now ordinal instead of localeCompare (affects only odd-cased addresses).

## 2026-11-18: Packets page Role filter uses the same searchable multi-select
- Decision: the nav tab "Packets" (/company-packets, components/CompanyPacketsView.tsx) now uses the shared searchable multi-select for Role (type to narrow, Select all N, Clear; empty = All), like Questions and Assignments. MultiSelect moved out of components/Filters.tsx into components/MultiSelect.tsx (pure move) with two small options for pages whose dropdowns have no label above them: `inline` (no label, same box styling as the neighbouring native selects) and `allLabel` ("All roles"). Role options stay cascaded by Track / Experience / Company; changing any of those clears Role.
- Not changed: Track, Experience and Company stay native selects (only Role was requested); the Trending roles page (/packets) filters by role pills, not a dropdown; the Packets filters are not saved in the URL (they weren't before).

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

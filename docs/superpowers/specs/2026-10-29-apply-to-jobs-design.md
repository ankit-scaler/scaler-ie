# Apply to Jobs — Design

Date: 2026-10-29
Status: approved (pending final spec review)

## Purpose

Add a new "Apply to Jobs" section to Interview Vault that surfaces live tech
job postings relevant to the app's users (interview-prep candidates), sourced
via [JobSpy](https://github.com/speedyapply/JobSpy), with filters so users can
narrow down to what they're looking for.

## Constraints

- The app is explicitly "free stack, zero cost" (Next.js 14 on Vercel's free
  tier, Supabase free tier, GitHub Actions cron). Any new feature must stay
  within that model — no new paid services.
- JobSpy is a Python library. Live, per-request scraping of job boards is slow
  (30s–2min across multiple sites) and prone to rate-limiting/blocking, which
  rules out calling it synchronously from a Vercel serverless function or a
  hosted request-response microservice as the default path.

## Architecture

Reuses the pattern already established by `sync/sync_sheet.py` +
`.github/workflows/daily-sync.yml`: a scheduled Python job writes to Supabase;
the Next.js app only ever reads from Supabase, never calls JobSpy directly.

```
GitHub Actions (daily cron)
  → sync/sync_jobs.py (JobSpy)
    → upserts into Supabase `jobs` table (dedup by fingerprint)
Next.js app
  → app/jobs/page.tsx (server component, cached read)
    → components/JobsView.tsx (client component: filters + list)
```

This keeps the feature entirely free (GitHub Actions free minutes, Supabase
free tier) and avoids live-scraping latency/reliability problems in the user
request path, at the cost of listings being up to ~24h stale (same tradeoff
the rest of the app already accepts for questions/assignments).

## Data pipeline

New file: `sync/sync_jobs.py`, modeled directly on `sync/sync_sheet.py`'s
structure (env-var config, Supabase client init, per-row upsert).

- **Dependency**: add `python-jobspy` to `sync/requirements.txt`.
- **Sites searched**: `linkedin`, `naukri`, `indeed` (JobSpy also supports
  `glassdoor`, `google`, `zip_recruiter`, `bayt` — not used initially to keep
  the daily run faster and less likely to get partially blocked; can be added
  later with a one-line change to the `site_name` list).
- **Search terms**: a fixed list covering broad tech roles — e.g. "Software
  Engineer", "SDE", "AI Engineer", "ML Engineer", "Data Analyst", "Data
  Scientist", "Forward Deployed Engineer", "Program Manager", "Engineering
  Manager" (exact final list finalized in the implementation plan/code, not
  pinned further here — it's config, not architecture).
- **Locations searched**: major India tech hubs — Bangalore, Hyderabad, Pune,
  Gurgaon/NCR, Mumbai, Chennai — plus a remote-specific search
  (`is_remote=True`) per role.
- **Schedule**: once daily, same cadence as `daily-sync.yml` (new workflow
  file `.github/workflows/daily-jobs-sync.yml`, reusing the existing
  `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` repo secrets — no new secrets
  needed since JobSpy doesn't require API keys for these sites).
- **Dedup**: `fingerprint` = hash of `(site, job_url)` (fallback to
  `(site, title, company, location)` if `job_url` is ever empty), upserted
  via `on_conflict=fingerprint` the same way `sync_sheet.py` dedupes
  questions/assignments.
- **Error isolation**: each (site × search term × location) call is wrapped
  individually — a failure (block, timeout, schema change on the site's end)
  is logged and skipped, not fatal to the run. A run that fails on every
  single site still exits 0 so the cron doesn't show a false-red failure
  for an upstream site change; it logs a warning instead.
- **Pruning**: at the start of each run, delete rows where
  `synced_at < now() - interval '30 days'` so the table doesn't grow
  unbounded with stale listings that no longer upsert (closed postings
  naturally age out since they stop being returned by the sites).

## Data model

New table in `supabase/schema.sql`:

```sql
create table if not exists jobs (
  id            bigserial primary key,
  site          text not null,        -- 'linkedin' | 'naukri' | 'indeed'
  title         text not null,
  company       text not null,
  location      text,
  is_remote     boolean not null default false,
  job_type      text,                 -- 'fulltime' | 'parttime' | 'internship' | 'contract'
  date_posted   date,
  job_url       text not null,
  search_role   text not null,        -- which configured search term found it
  fingerprint   text unique not null, -- dedupe key
  synced_at     timestamptz default now()
);
create index if not exists idx_jobs_role on jobs (lower(search_role));
create index if not exists idx_jobs_location on jobs (lower(location));
create index if not exists idx_jobs_posted on jobs (date_posted desc);
```

No `description` column — JobSpy returns full descriptions but they're often
large/messy HTML; out of scope for now, cards link out to the original
posting via `job_url` instead. Can be added later without a design change if
wanted.

RLS: follows the same policy as `questions`/`assignments` — readable by any
authenticated user, writable only via the service-role key (used by the sync
script), consistent with the rest of `supabase/schema.sql`.

## Frontend

- **`app/jobs/page.tsx`** (server component): same shape as
  `app/assignments/page.tsx` — redirects to `/login` if unauthenticated,
  fetches all rows via `unstable_cache(() => fetchAllRows<Job>("jobs", ...), ["all-jobs"], { revalidate: 300, tags: ["jobs"] })`,
  passes to `JobsView`.
- **`components/JobsView.tsx`** (client component): filters +
  **single-column, full-width list** — each job is one row spanning the full
  content width (unlike Assignments' `md:grid-cols-2 xl:grid-cols-3` card
  grid). A row shows title + company + location on the left, job-type badge
  + "posted X ago" + an "Apply" button (links to `job_url`, `target="_blank"`,
  `rel="noopener noreferrer"`) on the right.
  - Filters (all client-side over the already-fetched set, same approach as
    `AssignmentsView`): role/keyword search box (matches title/company),
    location dropdown (built from distinct `location` values in the data,
    plus a "Remote" entry filtering on `is_remote`), remote-only toggle,
    job-type dropdown, and "posted within" (24h / 7d / 30d, filtering on
    `date_posted`).
- **Nav**: add "Apply to Jobs" as a new tab in `components/Header.tsx` →
  `/jobs`. (Independent of, and in addition to, the still-pending "Revise
  with Crash Course" nav styling/overflow fix from earlier in this
  conversation — not implemented yet, tracked separately.)

## Non-goals (for this iteration)

- No in-app application flow — "Apply" always links out to the original
  posting.
- No per-user saved searches, bookmarks, or application tracking.
- No admin UI for editing the search-term/location config — it lives in
  `sync/sync_jobs.py` as code, matching how `sync/sync_sheet.py`'s config
  currently works.
- No live/on-demand search — all listings come from the daily cached scrape.

## Testing plan

No existing automated test suite in this repo to extend. Verification is:

- Run `sync/sync_jobs.py` locally against a dev Supabase project (or a dry
  run that prints instead of writing) to confirm JobSpy calls succeed and
  rows look right.
- `tsc --noEmit` after the frontend changes.
- Manual check of `/jobs` in a browser: filters behave correctly, Apply
  links open the right posting in a new tab, nav tab appears and routes
  correctly, empty-state (no jobs match filters) renders sensibly.

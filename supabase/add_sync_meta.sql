-- One-time migration (run in the Supabase SQL editor): a tiny key/value table
-- the nightly sync writes to, so the website knows the moment new data is in.
--
-- Used for: sync/sync_sheet.py writes `questions_synced_at` when the Questions
-- step finishes. The Questions page (app/page.tsx via lib/sync-version.ts)
-- reads that one value and puts it in its cache key, so learners get the fresh
-- questions right after the sync instead of waiting for the 6 h cache timer.
--
-- Safe to re-run. If this table doesn't exist, nothing breaks: the sync just
-- prints a notice and the page falls back to the 6 h timer.
create table if not exists public.sync_meta (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

-- Row-level security ON with NO policies: learners and anon users can neither
-- read nor write it. Only the server (service key) touches this table.
alter table public.sync_meta enable row level security;

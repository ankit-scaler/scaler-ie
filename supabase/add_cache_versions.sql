-- One-time migration: when each cached dataset last changed, so pages can
-- keep a day-long cache and still pick up new data the moment a sync
-- finishes. sync/sync_sheet.py stamps 'questions' and 'assignments' when it
-- finishes; sync/sync_jobs.py stamps 'jobs'. Pages read this tiny table
-- (see lib/cached-table.ts) and reload a dataset only when its stamp moves.
-- Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists cache_versions (
  name       text primary key,             -- 'questions' | 'assignments' | 'jobs'
  updated_at timestamptz not null default now()
);
insert into cache_versions (name) values ('questions'), ('assignments'), ('jobs')
  on conflict (name) do nothing;

-- Only the service-role client (server pages, sync jobs) reads or writes
-- it; RLS with no policies denies everyone else.
alter table cache_versions enable row level security;

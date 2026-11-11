-- One-time migration: when each cached dataset last changed. For now only
-- 'questions' is used: sync/sync_sheet.py stamps it after the questions step
-- and Admin topic edits stamp it straight away, and the Questions page keys
-- learners' cached question chunks on it (see lib/questions-chunks.ts).
-- Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists cache_versions (
  name       text primary key,             -- dataset name, e.g. 'questions'
  updated_at timestamptz not null default now()
);
insert into cache_versions (name) values ('questions')
  on conflict (name) do nothing;

-- Only the service-role client (server pages, sync jobs) reads or writes
-- it; RLS with no policies denies everyone else.
alter table cache_versions enable row level security;

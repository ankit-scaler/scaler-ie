-- One-time migration for the Questions page cache (see lib/questions-chunks.ts).
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- questions.updated_at moves whenever a row's content actually changes: the
-- nightly sync's upsert, AI topic classification, an Admin topic fix or
-- rename, or an edit made straight in Supabase. The site builds its cache
-- version from the newest updated_at + row count + newest id, so any change
-- reaches learners within a minute. Re-upserting an unchanged row (which
-- the sync does to every row each night) does not move it.

alter table questions add column if not exists updated_at timestamptz not null default now();
create index if not exists idx_q_updated_at on questions (updated_at desc);

create or replace function questions_touch_updated_at()
returns trigger language plpgsql as $$
begin
  if row(new.*) is distinct from row(old.*) then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_questions_updated_at on questions;
create trigger trg_questions_updated_at
  before update on questions
  for each row execute function questions_touch_updated_at();

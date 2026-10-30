-- One-time migration: adds Apply-to-Jobs click tracking. Run once in the
-- Supabase SQL editor. Safe to re-run.

create table if not exists job_applies (
  id         bigserial primary key,
  user_email text not null,
  -- Deliberately NOT a foreign key to jobs(id): job rows get pruned every
  -- 30-70 days (see sync/sync_jobs.py), but this table's whole point is a
  -- permanent click-history log — an `on delete cascade` would silently
  -- erase analytics history as listings age out.
  job_id     bigint not null,
  created_at timestamptz default now()
);
create index if not exists idx_ja_email   on job_applies (user_email);
create index if not exists idx_ja_job     on job_applies (job_id);
create index if not exists idx_ja_created on job_applies (created_at desc);

alter table job_applies enable row level security;

drop policy if exists "insert own job apply" on job_applies;
create policy "insert own job apply" on job_applies for insert with check (auth.jwt() ->> 'email' = user_email);

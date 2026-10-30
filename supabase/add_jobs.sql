-- One-time migration: adds the Apply to Jobs feature's table (daily-scraped
-- tech job postings, see sync/sync_jobs.py). Run once in the Supabase SQL
-- editor. Safe to re-run.

create table if not exists jobs (
  id            bigserial primary key,
  site          text not null,        -- 'linkedin' | 'naukri' | 'indeed'
  title         text not null,
  company       text not null,
  location      text,
  is_remote     boolean not null default false,
  job_type      text,                 -- 'fulltime' | 'parttime' | 'internship' | 'contract' | ...
  date_posted   date,
  job_url       text not null,
  search_role   text not null,        -- which configured search term found it
  fingerprint   text unique not null, -- dedupe key: hash(site, job_url)
  synced_at     timestamptz default now()
);
create index if not exists idx_jobs_role on jobs (lower(search_role));
create index if not exists idx_jobs_location on jobs (lower(location));
create index if not exists idx_jobs_posted on jobs (date_posted desc);

alter table jobs enable row level security;

drop policy if exists "read jobs" on jobs;
create policy "read jobs" on jobs for select using (auth.role() = 'authenticated');

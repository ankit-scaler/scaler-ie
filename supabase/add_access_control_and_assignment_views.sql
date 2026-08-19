-- One-time migration: adds (1) the learner allow-list used to gate sign-in,
-- and (2) assignment view tracking (mirrors packet_views). Run once in the
-- Supabase SQL editor. Safe to re-run.

create table if not exists assignment_views (
  id            bigserial primary key,
  user_email    text not null,
  assignment_id bigint not null references assignments(id) on delete cascade,
  created_at    timestamptz default now()
);
create index if not exists idx_av_email      on assignment_views (user_email);
create index if not exists idx_av_assignment on assignment_views (assignment_id);
create index if not exists idx_av_created    on assignment_views (created_at desc);

create table if not exists allowed_learners (
  email      text primary key,
  synced_at  timestamptz default now(),
  -- null = managed by the sheet sync; an admin's email = granted manually via
  -- Admin, which the sync must never delete even if the sheet doesn't list it.
  added_by   text
);
alter table allowed_learners add column if not exists added_by text;

alter table assignment_views enable row level security;
alter table allowed_learners enable row level security;

drop policy if exists "insert own assignment view" on assignment_views;
create policy "insert own assignment view" on assignment_views for insert with check (auth.jwt() ->> 'email' = user_email);
-- allowed_learners intentionally gets no policies: only the service-role
-- client (auth callback, sync job) touches it, so RLS with no policies
-- correctly denies anon/authenticated access.

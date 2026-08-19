-- Scaler IE Web App schema
-- Run this in Supabase SQL editor once.

create extension if not exists pgcrypto;

-- ============ CONTENT (populated by sync job) ============
create table if not exists questions (
  id           bigserial primary key,
  program      text not null,
  company      text not null,
  role         text not null,
  round        text,
  question     text not null,
  related_topic text,
  fingerprint  text unique not null,   -- dedupe key
  synced_at    timestamptz default now()
);
create index if not exists idx_q_company_role on questions (lower(company), lower(role));
create index if not exists idx_q_program on questions (program);

create table if not exists assignments (
  id           bigserial primary key,
  program      text,
  company      text not null,
  role         text not null,
  round        text,
  link         text,
  fingerprint  text unique not null,
  synced_at    timestamptz default now()
);
create index if not exists idx_a_company_role on assignments (lower(company), lower(role));

-- ============ ADMINS ============
create table if not exists admins (
  email text primary key,
  added_by text,
  added_at timestamptz default now()
);
-- Seed the first admin
insert into admins (email, added_by) values ('ankit.mishra@scaler.com', 'system')
  on conflict do nothing;

-- ============ ANALYTICS ============
create table if not exists page_views (
  id         bigserial primary key,
  user_email text not null,
  company    text,
  role       text,
  program    text,
  path       text,
  created_at timestamptz default now()
);
create index if not exists idx_pv_email on page_views (user_email);
create index if not exists idx_pv_created on page_views (created_at desc);
create index if not exists idx_pv_company_role on page_views (company, role);

create table if not exists sessions (
  id            bigserial primary key,
  user_email    text not null,
  started_at    timestamptz default now(),
  last_beat_at  timestamptz default now(),
  duration_sec  integer default 0
);
create index if not exists idx_s_email on sessions (user_email);
create index if not exists idx_s_started on sessions (started_at desc);

-- ============ PACKETS (hiring interview-prep packets, per Role x YoE) ============
-- Session recordings are dropped for now — clean up any tables from that
-- attempt so re-running this file after a pull doesn't leave orphans around.
drop table if exists session_watches, packet_session_links, packet_sessions cascade;

create table if not exists packets (
  id         bigserial primary key,
  role       text not null,
  yoe        text not null,
  doc_title  text,              -- display name of the source doc (reference for admins)
  doc_link   text,               -- actual URL, filled in via Admin > Manage packet links
  content_html       text,        -- cached, sanitized doc content rendered on-site
  content_synced_at  timestamptz, -- when content_html was last refreshed from doc_link
  sort_order int not null default 0,
  created_at timestamptz default now(),
  unique (role, yoe)
);

-- ============ PACKET ANALYTICS ============
create table if not exists packet_views (
  id         bigserial primary key,
  user_email text not null,
  packet_id  bigint not null references packets(id) on delete cascade,
  created_at timestamptz default now()
);
create index if not exists idx_pkv_email   on packet_views (user_email);
create index if not exists idx_pkv_packet  on packet_views (packet_id);
create index if not exists idx_pkv_created on packet_views (created_at desc);

-- ============ VIDEO RESOURCES (per Role x YoE, like packets) ============
create table if not exists video_resources (
  id         bigserial primary key,
  packet_id  bigint not null references packets(id) on delete cascade,
  topic      text not null,
  video_link text,
  sort_order int not null default 0,
  created_at timestamptz default now(),
  unique (packet_id, topic)
);
create index if not exists idx_vr_packet on video_resources (packet_id);

create table if not exists video_resource_views (
  id                bigserial primary key,
  user_email        text not null,
  video_resource_id bigint not null references video_resources(id) on delete cascade,
  created_at        timestamptz default now()
);
create index if not exists idx_vrv_email    on video_resource_views (user_email);
create index if not exists idx_vrv_resource on video_resource_views (video_resource_id);
create index if not exists idx_vrv_created  on video_resource_views (created_at desc);

-- ============ ASSIGNMENT ANALYTICS ============
create table if not exists assignment_views (
  id            bigserial primary key,
  user_email    text not null,
  assignment_id bigint not null references assignments(id) on delete cascade,
  created_at    timestamptz default now()
);
create index if not exists idx_av_email   on assignment_views (user_email);
create index if not exists idx_av_assignment on assignment_views (assignment_id);
create index if not exists idx_av_created on assignment_views (created_at desc);

-- ============ ACCESS CONTROL ============
-- Only these emails (synced nightly from the learner-tracking sheet, or
-- granted manually via Admin) plus anyone in `admins` may sign in — enforced
-- in app/auth/callback/route.ts.
create table if not exists allowed_learners (
  email      text primary key,
  synced_at  timestamptz default now(),
  -- null = managed by the sheet sync; an admin's email = granted manually via
  -- Admin, which the sync must never delete even if the sheet doesn't list it.
  added_by   text
);

-- ============ RLS ============
alter table questions   enable row level security;
alter table assignments enable row level security;
alter table admins      enable row level security;
alter table page_views  enable row level security;
alter table sessions    enable row level security;
alter table packets              enable row level security;
alter table packet_views         enable row level security;
alter table video_resources      enable row level security;
alter table video_resource_views enable row level security;
alter table assignment_views     enable row level security;
alter table allowed_learners     enable row level security;

-- Policies aren't CREATE-IF-NOT-EXISTS-able in Postgres, and the Supabase SQL editor
-- runs a pasted script as one transaction — one "already exists" error rolls back
-- everything above it too (tables included). Drop-then-create keeps this whole file
-- safe to paste and re-run any number of times.
drop policy if exists "read packets"         on packets;
drop policy if exists "insert own packet view"   on packet_views;
drop policy if exists "read video resources" on video_resources;
drop policy if exists "insert own video resource view" on video_resource_views;
drop policy if exists "insert own assignment view" on assignment_views;
drop policy if exists "read questions"   on questions;
drop policy if exists "read assignments" on assignments;
drop policy if exists "insert own view" on page_views;
drop policy if exists "own sessions rw" on sessions;
drop policy if exists "admins read self" on admins;

create policy "read packets" on packets for select using (auth.role() = 'authenticated');
create policy "insert own packet view" on packet_views for insert with check (auth.jwt() ->> 'email' = user_email);
create policy "read video resources" on video_resources for select using (auth.role() = 'authenticated');
create policy "insert own video resource view" on video_resource_views for insert with check (auth.jwt() ->> 'email' = user_email);
create policy "insert own assignment view" on assignment_views for insert with check (auth.jwt() ->> 'email' = user_email);
-- allowed_learners has no policies: only the service-role client (auth
-- callback, sync job) ever touches it, so RLS with zero policies is exactly
-- "deny all to anon/authenticated" — the intended behavior.

-- Anyone signed-in can read content
create policy "read questions"   on questions   for select using (auth.role() = 'authenticated');
create policy "read assignments" on assignments for select using (auth.role() = 'authenticated');

-- Users can insert their own analytics rows; only own sessions readable
create policy "insert own view" on page_views for insert with check (auth.jwt() ->> 'email' = user_email);
create policy "own sessions rw" on sessions   for all
  using    (auth.jwt() ->> 'email' = user_email)
  with check (auth.jwt() ->> 'email' = user_email);

-- Admin table: only admins can read/write (checked via service role in API)
create policy "admins read self" on admins for select using (auth.jwt() ->> 'email' = email);

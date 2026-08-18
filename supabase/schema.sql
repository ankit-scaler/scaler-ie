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
create table if not exists packets (
  id         bigserial primary key,
  role       text not null,
  yoe        text not null,
  doc_title  text,              -- display name of the source doc (reference for admins)
  doc_link   text,               -- actual URL, filled in via Admin > Manage packet links
  sort_order int not null default 0,
  created_at timestamptz default now(),
  unique (role, yoe)
);

create table if not exists packet_sessions (
  id         bigserial primary key,
  title      text not null unique,
  url        text,               -- actual recording URL, filled in via Admin > Manage packet links
  created_at timestamptz default now()
);

create table if not exists packet_session_links (
  packet_id  bigint not null references packets(id) on delete cascade,
  session_id bigint not null references packet_sessions(id) on delete cascade,
  sort_order int not null default 0,
  primary key (packet_id, session_id)
);
create index if not exists idx_psl_session on packet_session_links (session_id);

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

create table if not exists session_watches (
  id         bigserial primary key,
  user_email text not null,
  session_id bigint not null references packet_sessions(id) on delete cascade,
  created_at timestamptz default now()
);
create index if not exists idx_sw_email   on session_watches (user_email);
create index if not exists idx_sw_session on session_watches (session_id);
create index if not exists idx_sw_created on session_watches (created_at desc);

-- ============ RLS ============
alter table questions   enable row level security;
alter table assignments enable row level security;
alter table admins      enable row level security;
alter table page_views  enable row level security;
alter table sessions    enable row level security;
alter table packets              enable row level security;
alter table packet_sessions      enable row level security;
alter table packet_session_links enable row level security;
alter table packet_views         enable row level security;
alter table session_watches      enable row level security;

create policy "read packets"         on packets              for select using (auth.role() = 'authenticated');
create policy "read packet sessions" on packet_sessions       for select using (auth.role() = 'authenticated');
create policy "read packet links"    on packet_session_links  for select using (auth.role() = 'authenticated');

create policy "insert own packet view"   on packet_views    for insert with check (auth.jwt() ->> 'email' = user_email);
create policy "insert own session watch" on session_watches for insert with check (auth.jwt() ->> 'email' = user_email);

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

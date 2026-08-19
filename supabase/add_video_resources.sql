-- One-time migration: adds video resources (topic videos per packet) and
-- their view tracking. Run once in the Supabase SQL editor. Safe to re-run.

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

alter table video_resources      enable row level security;
alter table video_resource_views enable row level security;

drop policy if exists "read video resources" on video_resources;
drop policy if exists "insert own video resource view" on video_resource_views;

create policy "read video resources" on video_resources for select using (auth.role() = 'authenticated');
create policy "insert own video resource view" on video_resource_views for insert with check (auth.jwt() ->> 'email' = user_email);

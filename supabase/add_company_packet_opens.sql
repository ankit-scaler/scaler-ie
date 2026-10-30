-- One-time migration: adds Company-Packets "Open Link" click tracking. Run
-- once in the Supabase SQL editor. Safe to re-run.

create table if not exists company_packet_opens (
  id         bigserial primary key,
  user_email text not null,
  -- The packet lives in a separate project's Neon database, not here — slug
  -- is the only stable identifier this app has for it, and there's nothing
  -- local to foreign-key against.
  slug       text not null,
  created_at timestamptz default now()
);
create index if not exists idx_cpo_email   on company_packet_opens (user_email);
create index if not exists idx_cpo_slug    on company_packet_opens (slug);
create index if not exists idx_cpo_created on company_packet_opens (created_at desc);

alter table company_packet_opens enable row level security;

drop policy if exists "insert own company packet open" on company_packet_opens;
create policy "insert own company packet open" on company_packet_opens for insert with check (auth.jwt() ->> 'email' = user_email);

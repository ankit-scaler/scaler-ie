-- One-time migration: adds the "Request Packet" feature on /jobs. Run once
-- in the Supabase SQL editor. Safe to re-run.

create table if not exists packet_requests (
  id              bigserial primary key,
  user_email      text not null,
  contact_number  text not null,
  company         text not null,
  role            text not null,
  jd_text         text,
  interview_date  date,
  -- Set when the Company+Role match was found live in the Packets
  -- Generator's Neon DB at request time — null means no existing packet,
  -- which is exactly the set that got escalated to Slack.
  matched_slug    text,
  slack_notified  boolean not null default false,
  created_at      timestamptz default now()
);
create index if not exists idx_pr_email   on packet_requests (user_email);
create index if not exists idx_pr_created on packet_requests (created_at desc);
create index if not exists idx_pr_slack   on packet_requests (slack_notified);

alter table packet_requests enable row level security;

drop policy if exists "insert own packet request" on packet_requests;
create policy "insert own packet request" on packet_requests for insert with check (auth.jwt() ->> 'email' = user_email);

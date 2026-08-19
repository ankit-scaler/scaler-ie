-- One-time migration: cache Google Doc content on the packets table so the
-- Packets page can render it natively instead of linking out to Google Docs.
-- Run once in the Supabase SQL editor. Safe to re-run.

alter table packets add column if not exists content_html text;
alter table packets add column if not exists content_synced_at timestamptz;

-- One-time migration: when a question was asked, so question cards can say
-- "Asked Oct 2026" and the list can show the newest first. Filled by the
-- nightly sync (sync/sync_sheet.py) from the sheet's "Date of Call" column,
-- falling back to "Date Added". Run once in the Supabase SQL editor, then
-- trigger a sync (Admin → hard refresh) so existing rows get their dates.
-- Safe to re-run.

alter table questions add column if not exists asked_on date;
create index if not exists idx_q_asked_on on questions (asked_on desc);

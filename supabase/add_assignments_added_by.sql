-- One-time migration: adds `added_by` to assignments so a sheet-driven
-- "hard refresh" (Admin -> Hard refresh from Sheets) can tell sheet-managed
-- rows apart from ones an admin added by hand, and only ever deletes the
-- former. Run once in the Supabase SQL editor. Safe to re-run.

alter table assignments add column if not exists added_by text;

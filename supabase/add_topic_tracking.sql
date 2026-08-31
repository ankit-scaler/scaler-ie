-- One-time migration: adds topic tracking to page_views, so a learner
-- narrowing the Questions page filters to a Topic (with or without a
-- company/role also picked) gets logged the same way company/role searches
-- already are. Run once in the Supabase SQL editor. Safe to re-run.
-- No RLS policy change needed: the existing "insert own view" policy on
-- page_views checks only user_email, so it already covers this column.

alter table page_views add column if not exists topic text;
create index if not exists idx_pv_topic on page_views (topic);

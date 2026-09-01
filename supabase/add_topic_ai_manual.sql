-- One-time migration: marks rows whose topic_ai was set by hand via the
-- Admin "Fix a question's topic" editor. sync/backfill_topics.py's full
-- reclassification pass skips these rows, so a manual correction survives
-- future backfill runs instead of being silently overwritten. Run once in
-- the Supabase SQL editor. Safe to re-run.

alter table questions add column if not exists topic_ai_manual boolean not null default false;

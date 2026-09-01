-- One-time migration: adds an AI-classified canonical topic to questions,
-- so the frontend Topic filter reads a clean value (one of a fixed
-- taxonomy — see sync/topics.py) instead of the raw, often-duplicated
-- "Related Topic" text pulled straight from the sheet. related_topic is
-- left untouched as the raw source value; topic_ai is populated by
-- sync/sync_sheet.py (new rows, incrementally) and sync/backfill_topics.py
-- (the one-time bulk classification of existing rows). Run once in the
-- Supabase SQL editor. Safe to re-run.

alter table questions add column if not exists topic_ai text;
create index if not exists idx_q_topic_ai on questions (topic_ai);

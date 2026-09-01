-- Moves the canonical AI-topic taxonomy from hardcoded lists (lib/topics.ts,
-- sync/topics.py) into the database, so an admin can add/rename/delete a
-- topic from Admin without a code change + deploy. Both the website (via
-- app/api/admin/topics) and the nightly Gemini classifier (sync/topics.py's
-- fetch_canonical_topics) read this table at runtime.
create table if not exists canonical_topics (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- Seed with the topics already in use as of this migration (mirrors the
-- CANONICAL_TOPICS list previously hardcoded in sync/topics.py / lib/topics.ts).
insert into canonical_topics (name) values
  ('Arrays & Strings'),
  ('Linked Lists'),
  ('Trees & Graphs'),
  ('Dynamic Programming'),
  ('Recursion & Backtracking'),
  ('Sorting & Searching'),
  ('Hashing'),
  ('Stacks & Queues'),
  ('Greedy Algorithms'),
  ('Bit Manipulation'),
  ('Math & Number Theory'),
  ('System Design'),
  ('Object-Oriented Design'),
  ('Databases & SQL'),
  ('Operating Systems'),
  ('Networking'),
  ('Distributed Systems'),
  ('JavaScript & TypeScript'),
  ('HTML & CSS'),
  ('React'),
  ('Node.js & Backend (MERN)'),
  ('Python'),
  ('Java & Spring'),
  ('Machine Learning, AI & Data Science'),
  ('DevOps & Cloud'),
  ('Testing & QA'),
  ('Security'),
  ('Excel'),
  ('CRM'),
  ('Behavioral'),
  ('Case Study & Product Thinking'),
  ('Aptitude & Guesstimates'),
  ('Uncategorized')
on conflict (name) do nothing;

-- Rename a topic and re-point every question currently using it, in one
-- transaction — so a rename can never leave `questions.topic_ai` holding a
-- name canonical_topics no longer recognizes (the exact bug a stale "Java"
-- value caused before this table existed).
create or replace function rename_canonical_topic(old_name text, new_name text)
returns void
language plpgsql
as $$
begin
  if old_name = new_name then
    return;
  end if;
  if not exists (select 1 from canonical_topics where name = old_name) then
    raise exception 'Topic "%" not found.', old_name;
  end if;
  if exists (select 1 from canonical_topics where name = new_name) then
    raise exception 'A topic named "%" already exists.', new_name;
  end if;
  update questions set topic_ai = new_name where topic_ai = old_name;
  update canonical_topics set name = new_name where name = old_name;
end;
$$;

-- Refuses to delete a topic that's still in use — an admin must reassign
-- those questions first (via "Fix a question's topic") rather than the
-- deletion silently orphaning them onto a now-invalid topic_ai value.
create or replace function delete_canonical_topic(topic_name text)
returns void
language plpgsql
as $$
declare
  in_use_count int;
begin
  select count(*) into in_use_count from questions where topic_ai = topic_name;
  if in_use_count > 0 then
    raise exception 'Cannot delete "%": % question(s) still use this topic. Reassign them first.', topic_name, in_use_count;
  end if;
  delete from canonical_topics where name = topic_name;
end;
$$;

-- One grouped count query for Admin's topic manager — also how it surfaces
-- "orphan" topic_ai values that exist on questions but aren't in
-- canonical_topics (e.g. a value left over from before a rename/rename
-- bug), instead of that only being discoverable by someone querying the DB
-- by hand.
create or replace function topic_ai_counts()
returns table(topic text, cnt bigint)
language sql
stable
as $$
  select topic_ai, count(*) from questions group by topic_ai order by count(*) desc;
$$;

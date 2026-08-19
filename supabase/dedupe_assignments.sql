-- One-time cleanup: older syncs computed the assignments fingerprint from
-- (program, company, role, round, link). Every time link-extraction logic
-- improved, previously-synced rows got a new fingerprint and were inserted
-- as fresh duplicates instead of being updated in place — so many
-- (company, role) pairs now have 2+ rows, often an old linkless one sitting
-- next to a newer one with the real link.
--
-- Run this ONCE in the Supabase SQL editor, AFTER deploying the fingerprint
-- fix (sync_sheet.py + app/api/admin/assignments/route.ts both now compute
-- fingerprint without `link`, so this problem won't recur going forward).
--
-- For each (program, company, role, round) group, keeps one row — preferring
-- one that has a link, tie-broken by most recently synced — and deletes the
-- rest. Safe to re-run; a no-op once there are no duplicates left.

with ranked as (
  select
    id,
    row_number() over (
      partition by coalesce(program, ''), lower(trim(company)), lower(trim(role)), coalesce(round, '')
      order by (link is not null) desc, synced_at desc, id desc
    ) as rn
  from assignments
)
delete from assignments
where id in (select id from ranked where rn > 1);

-- Step 2: the surviving rows still have their OLD fingerprint stored (hashed
-- with link included) — without this, the very next sync would fail to
-- recognize them under the new (link-free) formula and duplicate them all
-- over again. Recompute every row's fingerprint to match sync_sheet.py's
-- fp(program, company, role, round).
create extension if not exists pgcrypto;

update assignments
set fingerprint = encode(
  digest(
    coalesce(program, '') || '||' || coalesce(company, '') || '||' || coalesce(role, '') || '||' || coalesce(round, ''),
    'sha256'
  ),
  'hex'
);

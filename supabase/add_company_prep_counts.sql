-- One-time migration: a small per-company summary of what prep the vault
-- has (past questions, assignments, open jobs), so pages can link between
-- each other ("142 past questions for Amazon →") without loading whole
-- tables just to count. Run once in the Supabase SQL editor. Safe to re-run.
--
-- company_key is lower(trim(company)): the same key lib/prep-shared.ts
-- builds in TypeScript, so names from different sources ("Amazon",
-- "amazon ") line up. The display name is whichever spelling is most common.
-- security_invoker makes the view respect the underlying tables' RLS
-- (signed-in users can read them) instead of running as the view's owner.

create or replace view company_prep_counts with (security_invoker = true) as
select lower(btrim(company))                        as company_key,
       mode() within group (order by btrim(company)) as company,
       count(*) filter (where src = 'q')            as questions,
       count(*) filter (where src = 'a')            as assignments,
       count(*) filter (where src = 'j')            as jobs
from (
  select company, 'q' as src from questions
  union all
  select company, 'a' from assignments
  union all
  select company, 'j' from jobs where date_posted >= current_date - 30
) t
where btrim(coalesce(company, '')) <> ''
group by 1;

grant select on company_prep_counts to authenticated;

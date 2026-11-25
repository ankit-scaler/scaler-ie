-- One-time migration (run in the Supabase SQL editor): unique users per IST
-- day / week / month, for the "App & tab usage" table on the admin Tracking page.
--
-- Why a new function: unique users per week or month can't be derived by
-- adding up daily counts (the same learner appears on several days), so this
-- counts DISTINCT learners per period in the database.
--
-- Returns the last 5 COMPLETE periods (the current, partly-finished one is
-- left out). 5 because the table shows 4 and needs one more to compute the
-- change of the oldest column.
--   * p_grain: 'day' | 'week' | 'month' (anything else = 'day')
--   * periods are IST (Asia/Kolkata); weeks start Monday; months are calendar months
--   * internal @scaler.com accounts are excluded
--   * metrics: app (a sessions row), questions '/', assignments '/assignments',
--     packets '/company-packets', trending '/packets', hiring '/jobs',
--     crash_course '/crash-course' (written when the header's Crash Course link is clicked)
create or replace function admin_period_activity(p_grain text)
returns table (period date, metric text, users int)
language sql
stable
as $$
  with cfg as (
    select g, date_trunc(g, now() at time zone 'Asia/Kolkata')::date as cur
      from (select case when p_grain in ('week', 'month') then p_grain else 'day' end as g) x
  ), win as (
    select g, cur,
           (cur - case g when 'day' then interval '5 days'
                         when 'week' then interval '35 days'
                         else interval '5 months' end)::date as since
      from cfg
  ), ev as (
    select w.g, 'app'::text as k, s.user_email as e,
           date_trunc(w.g, s.started_at at time zone 'Asia/Kolkata')::date as period
      from sessions s, win w
     where s.started_at >= (w.since::timestamp at time zone 'Asia/Kolkata')
       and s.started_at <  (w.cur::timestamp  at time zone 'Asia/Kolkata')
       and s.user_email not ilike '%@scaler.com'
    union all
    select w.g,
           case v.path when '/' then 'questions'
                       when '/assignments' then 'assignments'
                       when '/company-packets' then 'packets'
                       when '/packets' then 'trending'
                       when '/jobs' then 'hiring'
                       else 'crash_course' end,
           v.user_email,
           date_trunc(w.g, v.created_at at time zone 'Asia/Kolkata')::date
      from page_views v, win w
     where v.path in ('/', '/assignments', '/company-packets', '/packets', '/jobs', '/crash-course')
       and v.created_at >= (w.since::timestamp at time zone 'Asia/Kolkata')
       and v.created_at <  (w.cur::timestamp  at time zone 'Asia/Kolkata')
       and v.user_email not ilike '%@scaler.com'
  )
  select ev.period, ev.k, count(distinct ev.e)::int
    from ev
   group by ev.period, ev.k;
$$;

-- Server-only: the admin API calls this with the service-role key.
revoke all on function admin_period_activity(text) from public, anon, authenticated;
grant execute on function admin_period_activity(text) to service_role;

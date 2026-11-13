-- One-time migration (run in the Supabase SQL editor): per-day unique counts
-- for the admin Tracking page's charts and stat tiles.
--
-- Why: the Tracking API used to pull every raw row for the window and count
-- them in the browser. Supabase caps a request at ~1000 rows, so 7d/30d
-- windows (thousands of session rows) were silently truncated and charts
-- disagreed with each other. This function counts in the database and
-- returns ONE row per IST day, so the numbers are exact at any window size.
--
-- Rules mirrored from components/AdminTracking.tsx:
--   * days are IST calendar days (Asia/Kolkata)
--   * internal @scaler.com accounts are excluded
--   * every metric is "distinct learner per day"; job applies and company
--     packet opens are distinct (learner, item) per day
--   * "searched" = page_views row with a non-empty company, role or topic
create or replace function admin_daily_activity(p_since timestamptz, p_until timestamptz default null)
returns table (
  day                    date,
  active_users           int,
  searched_users         int,
  packet_users           int,
  video_users            int,
  jobs_users             int,
  company_packets_users  int,
  questions_visits       int,
  assignments_visits     int,
  job_apply_clicks       int,
  company_packet_opens   int
)
language sql
stable
as $$
  with ev as (
    select (started_at at time zone 'Asia/Kolkata')::date as d, 'active' as k, user_email as e, '' as item
      from sessions
     where started_at >= p_since and (p_until is null or started_at <= p_until)
       and user_email not ilike '%@scaler.com'
    union all
    select (created_at at time zone 'Asia/Kolkata')::date, 'searched', user_email, ''
      from page_views
     where created_at >= p_since and (p_until is null or created_at <= p_until)
       and user_email not ilike '%@scaler.com'
       and coalesce(nullif(company, ''), nullif(role, ''), nullif(topic, '')) is not null
    union all
    select (created_at at time zone 'Asia/Kolkata')::date, 'jobs', user_email, ''
      from page_views
     where created_at >= p_since and (p_until is null or created_at <= p_until)
       and user_email not ilike '%@scaler.com' and path = '/jobs'
    union all
    select (created_at at time zone 'Asia/Kolkata')::date, 'company_packets', user_email, ''
      from page_views
     where created_at >= p_since and (p_until is null or created_at <= p_until)
       and user_email not ilike '%@scaler.com' and path = '/company-packets'
    union all
    select (created_at at time zone 'Asia/Kolkata')::date, 'questions', user_email, ''
      from page_views
     where created_at >= p_since and (p_until is null or created_at <= p_until)
       and user_email not ilike '%@scaler.com' and path = '/'
    union all
    select (created_at at time zone 'Asia/Kolkata')::date, 'assignments', user_email, ''
      from page_views
     where created_at >= p_since and (p_until is null or created_at <= p_until)
       and user_email not ilike '%@scaler.com' and path = '/assignments'
    union all
    select (created_at at time zone 'Asia/Kolkata')::date, 'packets', user_email, ''
      from packet_views
     where created_at >= p_since and (p_until is null or created_at <= p_until)
       and user_email not ilike '%@scaler.com'
    union all
    select (created_at at time zone 'Asia/Kolkata')::date, 'videos', user_email, ''
      from video_resource_views
     where created_at >= p_since and (p_until is null or created_at <= p_until)
       and user_email not ilike '%@scaler.com'
    union all
    select (created_at at time zone 'Asia/Kolkata')::date, 'job_applies', user_email, job_id::text
      from job_applies
     where created_at >= p_since and (p_until is null or created_at <= p_until)
       and user_email not ilike '%@scaler.com'
    union all
    select (created_at at time zone 'Asia/Kolkata')::date, 'cp_opens', user_email, slug
      from company_packet_opens
     where created_at >= p_since and (p_until is null or created_at <= p_until)
       and user_email not ilike '%@scaler.com'
  )
  select
    d as day,
    (count(distinct e || '|' || item) filter (where k = 'active'))::int,
    (count(distinct e || '|' || item) filter (where k = 'searched'))::int,
    (count(distinct e || '|' || item) filter (where k = 'packets'))::int,
    (count(distinct e || '|' || item) filter (where k = 'videos'))::int,
    (count(distinct e || '|' || item) filter (where k = 'jobs'))::int,
    (count(distinct e || '|' || item) filter (where k = 'company_packets'))::int,
    (count(distinct e || '|' || item) filter (where k = 'questions'))::int,
    (count(distinct e || '|' || item) filter (where k = 'assignments'))::int,
    (count(distinct e || '|' || item) filter (where k = 'job_applies'))::int,
    (count(distinct e || '|' || item) filter (where k = 'cp_opens'))::int
  from ev
  group by d
  order by d;
$$;

-- Server-only: the admin stats API calls this with the service-role key.
revoke all on function admin_daily_activity(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function admin_daily_activity(timestamptz, timestamptz) to service_role;

-- One-time seed: "Priority Roles for interventions - Packets Role Wise"
-- Run this once in the Supabase SQL editor, AFTER schema.sql has been applied.
-- Safe to re-run (upserts on the natural keys).
--
-- doc_link and packet_sessions.url are intentionally left blank — the source CSV only
-- had Google Doc / recording *titles*, not URLs (Sheets drops hyperlinks on export).
-- Fill in the real links via Admin > Manage packet links once this seed has run.

insert into packet_sessions (title) values
  ('Graph Interview Problems'),
  ('Dynamic Programming Interview Problems'),
  ('Heap & Greedy Interview Problems'),
  ('Backtracking & Advanced Tree Interview Problems'),
  ('Linear Data Structure Interview Problems'),
  ('HashMap & Sorting Interview Problems'),
  ('Array Interview Problems'),
  ('Python Bootcamp Session'),
  ('Data Analytics Bootcamp'),
  ('DA Bootcamp - Session 2')
on conflict (title) do nothing;

insert into packets (role, yoe, doc_title, sort_order) values
  ('Backend Engineer',   '2–5 yrs', null,                                  1),
  ('Backend Engineer',   '5–8 yrs', 'IP - Backend Engineer ( 5-8 YoE )',   2),
  ('Frontend Engineer',  '2–5 yrs', 'IP - Frontend Engineer ( 2-5 YoE )',  3),
  ('Data Scientist',     '2–5 yrs', 'IP - Data Scientist ( 2-5 YoE )',     4),
  ('FullStack Engineer', '2–5 yrs', 'IP - Fullstack Engineer ( 2-5 YoE)',  5),
  ('FullStack Engineer', '5–8 yrs', 'IP - Fullstack Engineer (5-8 YoE)',   6),
  ('Data Scientist',     '5–8 yrs', 'IP - Data Scientist (5-8 YoE)',       7),
  ('Data Analyst',       '2–5 yrs', 'IP - Data Analyst (2-5 YoE)',         8),
  ('DevOps Engineer',    '2–5 yrs', 'IP - DevOps Engineer (2-5 YoE)',      9),
  ('Frontend Engineer',  '5–8 yrs', 'IP - Frontend Engineer (5-8 YoE)',    10)
on conflict (role, yoe) do update set doc_title = excluded.doc_title, sort_order = excluded.sort_order;

with links(role, yoe, title, ord) as (
  values
    ('Backend Engineer',   '2–5 yrs', 'Graph Interview Problems', 1),
    ('Backend Engineer',   '2–5 yrs', 'Dynamic Programming Interview Problems', 2),
    ('Backend Engineer',   '2–5 yrs', 'Heap & Greedy Interview Problems', 3),
    ('Backend Engineer',   '2–5 yrs', 'Backtracking & Advanced Tree Interview Problems', 4),
    ('Backend Engineer',   '2–5 yrs', 'Linear Data Structure Interview Problems', 5),
    ('Backend Engineer',   '2–5 yrs', 'HashMap & Sorting Interview Problems', 6),
    ('Backend Engineer',   '2–5 yrs', 'Array Interview Problems', 7),
    ('Backend Engineer',   '2–5 yrs', 'Python Bootcamp Session', 8),

    ('Backend Engineer',   '5–8 yrs', 'Graph Interview Problems', 1),
    ('Backend Engineer',   '5–8 yrs', 'Dynamic Programming Interview Problems', 2),
    ('Backend Engineer',   '5–8 yrs', 'Heap & Greedy Interview Problems', 3),
    ('Backend Engineer',   '5–8 yrs', 'Backtracking & Advanced Tree Interview Problems', 4),
    ('Backend Engineer',   '5–8 yrs', 'Linear Data Structure Interview Problems', 5),
    ('Backend Engineer',   '5–8 yrs', 'HashMap & Sorting Interview Problems', 6),
    ('Backend Engineer',   '5–8 yrs', 'Array Interview Problems', 7),
    ('Backend Engineer',   '5–8 yrs', 'Python Bootcamp Session', 8),

    ('Frontend Engineer',  '2–5 yrs', 'Graph Interview Problems', 1),
    ('Frontend Engineer',  '2–5 yrs', 'Dynamic Programming Interview Problems', 2),
    ('Frontend Engineer',  '2–5 yrs', 'Heap & Greedy Interview Problems', 3),
    ('Frontend Engineer',  '2–5 yrs', 'Backtracking & Advanced Tree Interview Problems', 4),
    ('Frontend Engineer',  '2–5 yrs', 'Linear Data Structure Interview Problems', 5),
    ('Frontend Engineer',  '2–5 yrs', 'HashMap & Sorting Interview Problems', 6),
    ('Frontend Engineer',  '2–5 yrs', 'Array Interview Problems', 7),
    ('Frontend Engineer',  '2–5 yrs', 'Python Bootcamp Session', 8),

    ('Frontend Engineer',  '5–8 yrs', 'Graph Interview Problems', 1),
    ('Frontend Engineer',  '5–8 yrs', 'Dynamic Programming Interview Problems', 2),
    ('Frontend Engineer',  '5–8 yrs', 'Heap & Greedy Interview Problems', 3),
    ('Frontend Engineer',  '5–8 yrs', 'Backtracking & Advanced Tree Interview Problems', 4),
    ('Frontend Engineer',  '5–8 yrs', 'Linear Data Structure Interview Problems', 5),
    ('Frontend Engineer',  '5–8 yrs', 'HashMap & Sorting Interview Problems', 6),
    ('Frontend Engineer',  '5–8 yrs', 'Array Interview Problems', 7),
    ('Frontend Engineer',  '5–8 yrs', 'Python Bootcamp Session', 8),

    ('Data Scientist',     '2–5 yrs', 'Python Bootcamp Session', 1),
    ('Data Scientist',     '5–8 yrs', 'Python Bootcamp Session', 1),

    ('FullStack Engineer', '2–5 yrs', 'Graph Interview Problems', 1),
    ('FullStack Engineer', '2–5 yrs', 'Dynamic Programming Interview Problems', 2),
    ('FullStack Engineer', '2–5 yrs', 'Heap & Greedy Interview Problems', 3),
    ('FullStack Engineer', '2–5 yrs', 'Backtracking & Advanced Tree Interview Problems', 4),
    ('FullStack Engineer', '2–5 yrs', 'Linear Data Structure Interview Problems', 5),
    ('FullStack Engineer', '2–5 yrs', 'HashMap & Sorting Interview Problems', 6),
    ('FullStack Engineer', '2–5 yrs', 'Array Interview Problems', 7),
    ('FullStack Engineer', '2–5 yrs', 'Python Bootcamp Session', 8),

    ('FullStack Engineer', '5–8 yrs', 'Graph Interview Problems', 1),
    ('FullStack Engineer', '5–8 yrs', 'Dynamic Programming Interview Problems', 2),
    ('FullStack Engineer', '5–8 yrs', 'Heap & Greedy Interview Problems', 3),
    ('FullStack Engineer', '5–8 yrs', 'Backtracking & Advanced Tree Interview Problems', 4),
    ('FullStack Engineer', '5–8 yrs', 'Linear Data Structure Interview Problems', 5),
    ('FullStack Engineer', '5–8 yrs', 'HashMap & Sorting Interview Problems', 6),
    ('FullStack Engineer', '5–8 yrs', 'Array Interview Problems', 7),
    ('FullStack Engineer', '5–8 yrs', 'Python Bootcamp Session', 8),

    ('Data Analyst',       '2–5 yrs', 'Data Analytics Bootcamp', 1),
    ('Data Analyst',       '2–5 yrs', 'DA Bootcamp - Session 2', 2)
)
insert into packet_session_links (packet_id, session_id, sort_order)
select p.id, s.id, links.ord
from links
join packets p on p.role = links.role and p.yoe = links.yoe
join packet_sessions s on s.title = links.title
on conflict (packet_id, session_id) do update set sort_order = excluded.sort_order;

-- One-time seed: "Priority Roles for interventions - Role wise Video Resources"
-- Run this once in the Supabase SQL editor, AFTER schema.sql (or
-- add_video_resources.sql) and seed_packets.sql have both been applied —
-- this joins against existing packets by (role, yoe).
-- Safe to re-run (upserts on the natural key (packet_id, topic)).

insert into video_resources (packet_id, topic, video_link, sort_order)
select p.id, v.topic, v.video_link, v.sort_order
from (values
  ('Backend Engineer',   '2–5 yrs', 'Graph Interview Problems',                        'https://www.scaler.com/meetings/i/graph-interview-problems-2/archive',                        1),
  ('Backend Engineer',   '2–5 yrs', 'Dynamic Programming Interview Problems',          'https://www.scaler.com/meetings/i/dynamic-programming-interview-problems-2/archive',          2),
  ('Backend Engineer',   '2–5 yrs', 'Heap & Greedy Interview Problems',                'https://www.scaler.com/meetings/i/heap-greedy-interview-problems-2/archive',                  3),
  ('Backend Engineer',   '2–5 yrs', 'Backtracking & Advanced Tree Interview Problems', 'https://www.scaler.com/meetings/i/backtracking-advanced-tree-interview-problems-2/archive',   4),
  ('Backend Engineer',   '2–5 yrs', 'Linear Data Structure Interview Problems',        'https://www.scaler.com/meetings/i/linear-data-structure-interview-problems-2/archive',        5),
  ('Backend Engineer',   '2–5 yrs', 'HashMap & Sorting Interview Problems',            'https://www.scaler.com/meetings/i/hashmap-sorting-interview-problems-2/archive',              6),
  ('Backend Engineer',   '2–5 yrs', 'Array Interview Problems',                        'https://www.scaler.com/meetings/i/array-interview-problems-2/archive',                        7),

  ('Backend Engineer',   '5–8 yrs', 'Graph Interview Problems',                        'https://www.scaler.com/meetings/i/graph-interview-problems-2/archive',                        1),
  ('Backend Engineer',   '5–8 yrs', 'Dynamic Programming Interview Problems',          'https://www.scaler.com/meetings/i/dynamic-programming-interview-problems-2/archive',          2),
  ('Backend Engineer',   '5–8 yrs', 'Heap & Greedy Interview Problems',                'https://www.scaler.com/meetings/i/heap-greedy-interview-problems-2/archive',                  3),
  ('Backend Engineer',   '5–8 yrs', 'Backtracking & Advanced Tree Interview Problems', 'https://www.scaler.com/meetings/i/backtracking-advanced-tree-interview-problems-2/archive',   4),
  ('Backend Engineer',   '5–8 yrs', 'Linear Data Structure Interview Problems',        'https://www.scaler.com/meetings/i/linear-data-structure-interview-problems-2/archive',        5),
  ('Backend Engineer',   '5–8 yrs', 'HashMap & Sorting Interview Problems',            'https://www.scaler.com/meetings/i/hashmap-sorting-interview-problems-2/archive',              6),
  ('Backend Engineer',   '5–8 yrs', 'Array Interview Problems',                        'https://www.scaler.com/meetings/i/array-interview-problems-2/archive',                        7),

  ('Frontend Engineer',  '2–5 yrs', 'Graph Interview Problems',                        'https://www.scaler.com/meetings/i/graph-interview-problems-2/archive',                        1),
  ('Frontend Engineer',  '2–5 yrs', 'Dynamic Programming Interview Problems',          'https://www.scaler.com/meetings/i/dynamic-programming-interview-problems-2/archive',          2),
  ('Frontend Engineer',  '2–5 yrs', 'Heap & Greedy Interview Problems',                'https://www.scaler.com/meetings/i/heap-greedy-interview-problems-2/archive',                  3),
  ('Frontend Engineer',  '2–5 yrs', 'Backtracking & Advanced Tree Interview Problems', 'https://www.scaler.com/meetings/i/backtracking-advanced-tree-interview-problems-2/archive',   4),
  ('Frontend Engineer',  '2–5 yrs', 'Linear Data Structure Interview Problems',        'https://www.scaler.com/meetings/i/linear-data-structure-interview-problems-2/archive',        5),
  ('Frontend Engineer',  '2–5 yrs', 'HashMap & Sorting Interview Problems',            'https://www.scaler.com/meetings/i/hashmap-sorting-interview-problems-2/archive',              6),
  ('Frontend Engineer',  '2–5 yrs', 'Array Interview Problems',                        'https://www.scaler.com/meetings/i/array-interview-problems-2/archive',                        7),

  ('Frontend Engineer',  '5–8 yrs', 'Graph Interview Problems',                        'https://www.scaler.com/meetings/i/graph-interview-problems-2/archive',                        1),
  ('Frontend Engineer',  '5–8 yrs', 'Dynamic Programming Interview Problems',          'https://www.scaler.com/meetings/i/dynamic-programming-interview-problems-2/archive',          2),
  ('Frontend Engineer',  '5–8 yrs', 'Heap & Greedy Interview Problems',                'https://www.scaler.com/meetings/i/heap-greedy-interview-problems-2/archive',                  3),
  ('Frontend Engineer',  '5–8 yrs', 'Backtracking & Advanced Tree Interview Problems', 'https://www.scaler.com/meetings/i/backtracking-advanced-tree-interview-problems-2/archive',   4),
  ('Frontend Engineer',  '5–8 yrs', 'Linear Data Structure Interview Problems',        'https://www.scaler.com/meetings/i/linear-data-structure-interview-problems-2/archive',        5),
  ('Frontend Engineer',  '5–8 yrs', 'HashMap & Sorting Interview Problems',            'https://www.scaler.com/meetings/i/hashmap-sorting-interview-problems-2/archive',              6),
  ('Frontend Engineer',  '5–8 yrs', 'Array Interview Problems',                        'https://www.scaler.com/meetings/i/array-interview-problems-2/archive',                        7),

  ('FullStack Engineer', '2–5 yrs', 'Graph Interview Problems',                        'https://www.scaler.com/meetings/i/graph-interview-problems-2/archive',                        1),
  ('FullStack Engineer', '2–5 yrs', 'Dynamic Programming Interview Problems',          'https://www.scaler.com/meetings/i/dynamic-programming-interview-problems-2/archive',          2),
  ('FullStack Engineer', '2–5 yrs', 'Heap & Greedy Interview Problems',                'https://www.scaler.com/meetings/i/heap-greedy-interview-problems-2/archive',                  3),
  ('FullStack Engineer', '2–5 yrs', 'Backtracking & Advanced Tree Interview Problems', 'https://www.scaler.com/meetings/i/backtracking-advanced-tree-interview-problems-2/archive',   4),
  ('FullStack Engineer', '2–5 yrs', 'Linear Data Structure Interview Problems',        'https://www.scaler.com/meetings/i/linear-data-structure-interview-problems-2/archive',        5),
  ('FullStack Engineer', '2–5 yrs', 'HashMap & Sorting Interview Problems',            'https://www.scaler.com/meetings/i/hashmap-sorting-interview-problems-2/archive',              6),
  ('FullStack Engineer', '2–5 yrs', 'Array Interview Problems',                        'https://www.scaler.com/meetings/i/array-interview-problems-2/archive',                        7),

  ('FullStack Engineer', '5–8 yrs', 'Graph Interview Problems',                        'https://www.scaler.com/meetings/i/graph-interview-problems-2/archive',                        1),
  ('FullStack Engineer', '5–8 yrs', 'Dynamic Programming Interview Problems',          'https://www.scaler.com/meetings/i/dynamic-programming-interview-problems-2/archive',          2),
  ('FullStack Engineer', '5–8 yrs', 'Heap & Greedy Interview Problems',                'https://www.scaler.com/meetings/i/heap-greedy-interview-problems-2/archive',                  3),
  ('FullStack Engineer', '5–8 yrs', 'Backtracking & Advanced Tree Interview Problems', 'https://www.scaler.com/meetings/i/backtracking-advanced-tree-interview-problems-2/archive',   4),
  ('FullStack Engineer', '5–8 yrs', 'Linear Data Structure Interview Problems',        'https://www.scaler.com/meetings/i/linear-data-structure-interview-problems-2/archive',        5),
  ('FullStack Engineer', '5–8 yrs', 'HashMap & Sorting Interview Problems',            'https://www.scaler.com/meetings/i/hashmap-sorting-interview-problems-2/archive',              6),
  ('FullStack Engineer', '5–8 yrs', 'Array Interview Problems',                        'https://www.scaler.com/meetings/i/array-interview-problems-2/archive',                        7),

  ('Data Analyst',       '2–5 yrs', 'Data Analytics Bootcamp',   'https://www.scaler.com/meetings/i/data-analytics-bootcamp/archive', 1),
  ('Data Analyst',       '2–5 yrs', 'DA Bootcamp - Session 2',   'https://www.scaler.com/meetings/i/da-bootcamp-session-2/archive',   2)
) as v(role, yoe, topic, video_link, sort_order)
join packets p on p.role = v.role and p.yoe = v.yoe
on conflict (packet_id, topic) do update set
  video_link = excluded.video_link,
  sort_order = excluded.sort_order;

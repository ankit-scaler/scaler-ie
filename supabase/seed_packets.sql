-- One-time seed: "Priority Roles for interventions - Packets Role Wise"
-- Run this once in the Supabase SQL editor, AFTER schema.sql has been applied.
-- Safe to re-run (upserts on the natural key, including doc_link).
--
-- Session recordings are dropped for now.

insert into packets (role, yoe, doc_title, doc_link, sort_order) values
  ('Backend Engineer',   '2–5 yrs', null,
    'https://docs.google.com/document/d/1aJbr3A-p-Kv1r1-3OINCW-pokpXbitMS3HuoTfAluj8/edit?usp=drive_web&ouid=102539273340661867096', 1),
  ('Backend Engineer',   '5–8 yrs', 'IP - Backend Engineer ( 5-8 YoE )',
    'https://docs.google.com/document/d/1sc2QxeGkX7_-CW5NRou_77DY696mNIc0EkAZiPkj1t8/edit?usp=sharing', 2),
  ('Frontend Engineer',  '2–5 yrs', 'IP - Frontend Engineer ( 2-5 YoE )',
    'https://docs.google.com/document/d/1x0qmPkjSVKSAgGUkxM9w58g4KrKEzEnQqpXVV7ltpbk/edit?usp=sharing', 3),
  ('Data Scientist',     '2–5 yrs', 'IP - Data Scientist ( 2-5 YoE )',
    'https://docs.google.com/document/d/1S4OiFZCucVeTZbdUgaDd6cyhGfvRpiWRsOFcapM8W0Q/edit?usp=sharing', 4),
  ('FullStack Engineer', '2–5 yrs', 'IP - Fullstack Engineer ( 2-5 YoE)',
    'https://docs.google.com/document/d/1NCGeDajYTl43JoAYv7Xt8e_UxDRfgQbD66kZU50DfBw/edit?usp=sharing', 5),
  ('FullStack Engineer', '5–8 yrs', 'IP - Fullstack Engineer (5-8 YoE)',
    'https://docs.google.com/document/d/1E3s6iL-RlrmGgHfMh_vZ3X_rnXGv61YDAO9Hn8plAS0/edit?usp=sharing', 6),
  ('Data Scientist',     '5–8 yrs', 'IP - Data Scientist (5-8 YoE)',
    'https://docs.google.com/document/d/1P05EW2G9ol3QZpCFaLsue25hPkBsUUPyPbv2nlxoErU/edit?usp=sharing', 7),
  ('Data Analyst',       '2–5 yrs', 'IP - Data Analyst (2-5 YoE)',
    'https://docs.google.com/document/d/1FKis3_qLSNJF43J9DRV1CXYX2uKbWh45YT4TyVgyTBM/edit?usp=sharing', 8),
  ('DevOps Engineer',    '2–5 yrs', 'IP - DevOps Engineer (2-5 YoE)',
    'https://docs.google.com/document/d/1dsNnR_cwWbfhhZixAI-Eb1v414FxMmzga-qJp-Lj2TQ/edit?usp=sharing', 9),
  ('Frontend Engineer',  '5–8 yrs', 'IP - Frontend Engineer (5-8 YoE)',
    'https://docs.google.com/document/d/1OeVH7XQFNFr10jSoQggKKhPiZrhN5_pcM3tTjsPFARU/edit?usp=sharing', 10)
on conflict (role, yoe) do update set
  doc_title  = excluded.doc_title,
  doc_link   = excluded.doc_link,
  sort_order = excluded.sort_order;

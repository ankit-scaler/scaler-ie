-- One-time migration: adds the learner feedback widget's table. Run once in
-- the Supabase SQL editor. Safe to re-run.

create table if not exists feedback (
  id                bigserial primary key,
  user_email        text not null,
  platform_rating   int not null check (platform_rating between 1 and 5),
  usefulness_rating int not null check (usefulness_rating between 1 and 5),
  feedback_text     text,
  created_at        timestamptz default now()
);
create index if not exists idx_feedback_email   on feedback (user_email);
create index if not exists idx_feedback_created on feedback (created_at desc);

alter table feedback enable row level security;

drop policy if exists "insert own feedback" on feedback;
create policy "insert own feedback" on feedback for insert with check (auth.jwt() ->> 'email' = user_email);

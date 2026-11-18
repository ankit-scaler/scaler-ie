-- Model resumes for Interview Vault (scaler-ie). Supabase / Postgres.
-- Run once in the Supabase SQL editor. Nothing here holds resume content;
-- content arrives through db/load_model_resumes.py.

create table if not exists public.model_resume (
  slug                      text primary key,          -- e.g. DSML_5-10_yrs_Switching_from_non-tech (also the URL segment)
  sort_key                  int  not null,             -- list order: programme, then experience, then background
  program                   text not null check (program in ('Academy','DSML','AIML','DevOps')),
  exp_band                  text not null check (exp_band in ('fresher','1-4','5-10','10plus')),
  exp_label                 text not null,             -- "Fresher (under 1 yr)", "5–10 yrs"
  background                text not null check (background in ('cs','noncs','same','different','switcher')),
  background_label          text not null,             -- "Switching from non-tech"
  persona                   text not null,             -- card + page subtitle
  headline                  text not null,             -- card + page title
  recruiters                jsonb not null,            -- ["…", "…", "…"]  "What recruiters look for"
  bullets_with_numbers_pct  smallint not null,         -- card meta: "94% of bullets carry a number"
  resume                    jsonb not null,            -- {work[], projects[], education[], skills[], achievements[]}
  rules                     jsonb not null,            -- [{id, kind: do|dont, text}]  checklist
  notes                     jsonb not null,            -- [{id, number, target, kind, title, body, star?, weaker?, rules[]}]
  -- Added vs the handoff pack: lets the list page show "N notes" without
  -- downloading every resume's notes (egress). Generated, so the loader
  -- script (which doesn't write it) keeps working unchanged.
  note_count                int generated always as (jsonb_array_length(notes)) stored,
  pdf_path                  text not null,             -- object key in the private bucket 'model-resumes'
  published                 boolean not null default true,
  version                   int not null default 1,
  updated_at                timestamptz not null default now()
);
create index if not exists model_resume_list on public.model_resume (sort_key) where published;

-- Usage events (one row per action). Read by the CO dashboard team, never shown to learners.
create table if not exists public.model_resume_event (
  id          bigserial primary key,
  slug        text references public.model_resume(slug),       -- null for list-page events
  user_email  text not null,
  kind        text not null check (kind in (
                'list_view','filter','resume_view','note_open','see_example',
                'pdf_download','mentor_cta','mentor_dashboard_cta','loom_play')),
  detail      jsonb,                                           -- e.g. {"note":"a3"} or {"from":"header"}
  at          timestamptz not null default now()
);
create index if not exists model_resume_event_at on public.model_resume_event (at);

-- Row-level security: signed-in learners read published rows; only the service key writes.
alter table public.model_resume enable row level security;
drop policy if exists model_resume_read on public.model_resume;
create policy model_resume_read on public.model_resume for select
  using (published and auth.role() = 'authenticated');   -- swap in the app's existing allow-list check if it has one

alter table public.model_resume_event enable row level security;
drop policy if exists model_resume_event_insert on public.model_resume_event;
create policy model_resume_event_insert on public.model_resume_event for insert
  with check (auth.role() = 'authenticated' and user_email = auth.jwt() ->> 'email');

-- Storage: create a PRIVATE bucket named 'model-resumes' (Dashboard → Storage → New bucket, Public off).
-- The app serves PDFs through short-lived signed URLs created server-side after the session check.

# Apply to Jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Apply to Jobs" page that shows tech job postings scraped daily via JobSpy, with filters, and a nav link to reach it.

**Architecture:** A new Python script (`sync/sync_jobs.py`), run once daily by a new GitHub Actions workflow, calls JobSpy's `scrape_jobs()` for a fixed matrix of tech roles × India cities (+ a remote search per role) across LinkedIn/Naukri/Indeed, and upserts results into a new Supabase `jobs` table (deduped by `(site, job_url)` fingerprint). The Next.js app never calls JobSpy directly — it only reads the cached `jobs` table, the same server/client split `app/assignments/page.tsx` + `AssignmentsView` already use.

**Tech Stack:** `python-jobspy==1.4.1` (new Python dep, requires Python >=3.10 — the existing workflow already uses 3.11), Supabase (existing), Next.js 14 + React (existing). No new JS dependencies.

**Spec:** `docs/superpowers/specs/2026-10-29-apply-to-jobs-design.md`

## Global Constraints

- Zero-cost stack only — no new paid services (GitHub Actions + Supabase free tiers).
- JobSpy runs **only** inside the scheduled GitHub Actions script — never called live from a Next.js request path.
- Scraped sites: `linkedin`, `naukri`, `indeed` only (not glassdoor/google/zip_recruiter/bayt).
- Dedup key is `(site, job_url)` only — never includes the search role/location, so the same posting found by two different searches collapses to one row.
- No automated test suite exists in this repo (JS or Python) and this plan does not introduce one — verification is `tsc --noEmit`, manual script runs, and manual browser checks, matching the spec's Testing plan.
- Jobs list UI is a single-column, full-width list of rows — not a card grid like Assignments.
- `job_url` empty/missing → row is never written/rendered (no dead "Apply" links).

## Review Focus

- A JobSpy call for one (role, location) combo throws, times out, or gets blocked → the run must log it and continue with the remaining combos, not abort the whole sync.
- Rows with missing `date_posted`, `job_type`, or `location` (JobSpy leaves these empty when a board doesn't provide them) must not crash the upsert or the frontend filters — stored/rendered as null/hidden, never as a crash.
- The same physical posting surfacing from two different search combos (e.g. matches both "Software Engineer" and "Engineering Manager", or both a city search and the remote search) must upsert to one row, not duplicate.
- A result with no usable `job_url`/`title`/`company` must be skipped before it ever reaches Supabase or the UI.
- No jobs matching the active filter combination must render the same "Nothing matches these filters yet" empty state the Assignments page already uses — never a blank screen or a `.map()` crash on an empty array.

---

## File Structure

- `supabase/add_jobs.sql` (new) — the `jobs` table migration, run manually via the Supabase SQL editor (matches this repo's `add_*.sql` convention).
- `supabase/schema.sql` (modify) — same table added here too, so a fresh install's one-shot schema stays complete.
- `sync/requirements.txt` (modify) — add `python-jobspy==1.4.1`.
- `sync/sync_jobs.py` (new) — the scraper/sync script.
- `.github/workflows/daily-jobs-sync.yml` (new) — daily cron, mirrors `daily-sync.yml`.
- `components/JobsView.tsx` (new) — client component: filters + list, exports the `Job` type.
- `components/JobRow.tsx` (new) — single full-width job row (mirrors `AssignmentCard.tsx`'s role, different layout).
- `app/jobs/page.tsx` (new) — server component, mirrors `app/assignments/page.tsx`.
- `components/Header.tsx` (modify) — add the "Apply to Jobs" nav tab.

---

### Task 1: Supabase `jobs` table

**Files:**
- Create: `supabase/add_jobs.sql`
- Modify: `supabase/schema.sql` (append to the `-- ============ CONTENT (populated by sync job) ============` section, after the `assignments` table)

**Interfaces:**
- Produces: a `jobs` table with columns `id, site, title, company, location, is_remote, job_type, date_posted, job_url, search_role, fingerprint, synced_at`, unique on `fingerprint`, used by Task 3 (writes) and Task 5 (reads).

- [ ] **Step 1: Write the migration**

Create `supabase/add_jobs.sql`:

```sql
-- Apply to Jobs: daily-scraped tech job postings (see sync/sync_jobs.py).
-- Run once in the Supabase SQL editor.
create table if not exists jobs (
  id            bigserial primary key,
  site          text not null,        -- 'linkedin' | 'naukri' | 'indeed'
  title         text not null,
  company       text not null,
  location      text,
  is_remote     boolean not null default false,
  job_type      text,                 -- 'fulltime' | 'parttime' | 'internship' | 'contract' | ...
  date_posted   date,
  job_url       text not null,
  search_role   text not null,        -- which configured search term found it
  fingerprint   text unique not null, -- dedupe key: hash(site, job_url)
  synced_at     timestamptz default now()
);
create index if not exists idx_jobs_role on jobs (lower(search_role));
create index if not exists idx_jobs_location on jobs (lower(location));
create index if not exists idx_jobs_posted on jobs (date_posted desc);

alter table jobs enable row level security;

create policy "jobs readable by authenticated users"
  on jobs for select
  to authenticated
  using (true);
```

- [ ] **Step 2: Check the RLS convention matches `questions`/`assignments`**

Run: `grep -A5 "alter table questions enable row level security" supabase/schema.sql supabase/*.sql`
Expected: a policy of the same shape (`for select to authenticated using (true)`, writes left to the service-role key only). If the existing policy differs (e.g. a different role name or a broader `using` clause), match `add_jobs.sql`'s policy to it instead of the snippet above.

- [ ] **Step 3: Append the same table to `schema.sql`**

Insert the identical `create table ... jobs` block (steps above, minus the RLS lines if `schema.sql` defines RLS separately elsewhere — check its existing convention first) into `supabase/schema.sql`, placed right after the `assignments` table definition, inside the `-- ============ CONTENT (populated by sync job) ============` section.

- [ ] **Step 4: Note it's a manual-apply migration (no automated run)**

No command to run here — this repo's `add_*.sql` files are applied by hand in the Supabase SQL editor (see README's setup section). Nothing else in this task depends on the table actually existing yet; Tasks 2-3 are testable without it (dry-run mode), and the table only needs to exist before this feature is deployed live.

- [ ] **Step 5: Commit**

```bash
git add supabase/add_jobs.sql supabase/schema.sql
git commit -m "feat: add jobs table for Apply to Jobs"
```

---

### Task 2: Job-row shaping — config, helpers, dedupe (`sync/sync_jobs.py`, part 1)

**Files:**
- Modify: `sync/requirements.txt`
- Create: `sync/sync_jobs.py`

**Interfaces:**
- Produces: `norm(s) -> str`, `fp(*parts) -> str`, `search_combos() -> Iterator[tuple[str, str, bool]]` (role, location, is_remote), `rows_from_results(df: pd.DataFrame, role: str) -> list[dict]` — each dict has keys `site, title, company, location, is_remote, job_type, date_posted, job_url, search_role, fingerprint`, matching the `jobs` table columns from Task 1. Task 3 consumes all four.

- [ ] **Step 1: Add the dependency**

In `sync/requirements.txt`, add a new line:

```
python-jobspy==1.4.1
```

- [ ] **Step 2: Install and confirm it resolves**

Run: `pip install -r sync/requirements.txt`
Expected: installs cleanly (also pulls in `pandas`, `beautifulsoup4`, `curl_cffi`, `pydantic`, `requests` — all transitive deps of `python-jobspy`, nothing to add by hand).

- [ ] **Step 3: Write `sync/sync_jobs.py` — config and helpers**

```python
"""
Daily sync: scrapes tech job postings via JobSpy and upserts them into
Supabase. Run once a day by .github/workflows/daily-jobs-sync.yml, reusing
the same SUPABASE_URL/SUPABASE_SERVICE_KEY secrets as sync_sheet.py.
Never called live from the Next.js app — see
docs/superpowers/specs/2026-10-29-apply-to-jobs-design.md for why.
"""
import argparse, hashlib, os, sys, time
from datetime import datetime, timedelta, timezone
import pandas as pd
from jobspy import scrape_jobs
from supabase import create_client

SITES = ["linkedin", "naukri", "indeed"]
ROLES = [
    "Software Engineer",
    "AI Engineer",
    "Machine Learning Engineer",
    "Data Analyst",
    "Data Scientist",
    "Forward Deployed Engineer",
    "Engineering Manager",
    "Program Manager",
]
CITIES = ["Bangalore, India", "Hyderabad, India", "Pune, India", "Gurgaon, India", "Mumbai, India", "Chennai, India"]
RESULTS_WANTED = 15
HOURS_OLD = 48
PRUNE_AFTER_DAYS = 30
# Pause between scrape_jobs() calls so ~56 back-to-back requests don't trip
# a site's rate limiter any faster than normal, spaced-out traffic would.
# Sites may still block some calls regardless (see the per-call try/except
# in run()) — that's expected and handled, not prevented, by this delay.
CALL_DELAY_SECONDS = 3

def norm(s):
    if s is None:
        return ""
    return str(s).strip()

def fp(*parts):
    return hashlib.sha256("||".join(str(p or "") for p in parts).encode()).hexdigest()

def search_combos():
    """Yields (role, location, is_remote) for every role x city, plus one
    remote-scoped search per role."""
    for role in ROLES:
        for city in CITIES:
            yield role, city, False
        yield role, "India", True

def rows_from_results(df: "pd.DataFrame | None", role: str) -> list[dict]:
    if df is None or len(df) == 0:
        return []
    out = []
    for r in df.to_dict("records"):
        job_url = norm(r.get("job_url"))
        title = norm(r.get("title"))
        company = norm(r.get("company"))
        site = norm(r.get("site"))
        # A row with no URL/title/company isn't something a user can act
        # on — skip rather than write a dead "Apply" link.
        if not job_url or not title or not company:
            continue
        date_posted = r.get("date_posted")
        date_posted_iso = date_posted.isoformat() if pd.notna(date_posted) else None
        is_remote = bool(r.get("is_remote")) if pd.notna(r.get("is_remote")) else False
        job_type = norm(r.get("job_type")) or None
        out.append({
            "site": site,
            "title": title,
            "company": company,
            "location": norm(r.get("location")) or None,
            "is_remote": is_remote,
            "job_type": job_type,
            "date_posted": date_posted_iso,
            "job_url": job_url,
            "search_role": role,
            # Deliberately (site, job_url) only — not role/location — so the
            # same posting found by two different searches (e.g. it matches
            # both "Software Engineer" and "Engineering Manager", or shows
            # up for both a city search and the remote search) dedupes to
            # one row instead of duplicating.
            "fingerprint": fp(site, job_url),
        })
    return out
```

- [ ] **Step 4: Write a self-check script covering dedupe + null-safety (Review Focus)**

No test framework exists in this repo, so this is a plain assert-based script, run directly — not committed, just used to verify Step 3 before moving on.

```bash
python3 -c "
import sys; sys.path.insert(0, 'sync')
import pandas as pd
from sync_jobs import rows_from_results, fp

# Null-safety: missing date_posted/job_type/location must not raise, and
# must come out as None rather than NaN/garbage.
df = pd.DataFrame([
    {'site': 'linkedin', 'title': 'SWE', 'company': 'Acme', 'location': None,
     'job_url': 'https://x/1', 'date_posted': pd.NaT, 'job_type': None, 'is_remote': None},
])
rows = rows_from_results(df, 'Software Engineer')
assert len(rows) == 1, rows
r = rows[0]
assert r['location'] is None and r['date_posted'] is None and r['job_type'] is None and r['is_remote'] is False, r

# Dedupe: same (site, job_url) found under two different search roles must
# produce the SAME fingerprint (role/location must not be in the hash).
df2 = pd.DataFrame([{'site': 'linkedin', 'title': 'SWE', 'company': 'Acme', 'location': 'Bangalore',
                      'job_url': 'https://x/1', 'date_posted': pd.NaT, 'job_type': 'fulltime', 'is_remote': False}])
rows_a = rows_from_results(df2, 'Software Engineer')
rows_b = rows_from_results(df2, 'Engineering Manager')
assert rows_a[0]['fingerprint'] == rows_b[0]['fingerprint'] == fp('linkedin', 'https://x/1')

# Rows with no job_url/title/company must be dropped, not written.
df3 = pd.DataFrame([{'site': 'indeed', 'title': '', 'company': 'Acme', 'location': None,
                      'job_url': 'https://x/2', 'date_posted': pd.NaT, 'job_type': None, 'is_remote': False}])
assert rows_from_results(df3, 'Software Engineer') == []

print('OK: rows_from_results null-safety + dedupe + skip-invalid all pass')
"
```

Expected: prints `OK: rows_from_results null-safety + dedupe + skip-invalid all pass` with no assertion errors.

- [ ] **Step 5: Commit**

```bash
git add sync/requirements.txt sync/sync_jobs.py
git commit -m "feat: add job-row shaping (config, dedupe, null-safety) for sync_jobs.py"
```

---

### Task 3: Scrape loop, Supabase I/O, pruning, dry-run (`sync/sync_jobs.py`, part 2)

**Files:**
- Modify: `sync/sync_jobs.py` (append below Task 2's code)

**Interfaces:**
- Consumes: `search_combos()`, `rows_from_results()` from Task 2.
- Produces: `run(dry_run: bool)`, a `__main__` CLI with `--dry-run`. Task 4's workflow calls `python sync/sync_jobs.py` (no flag) in production.

- [ ] **Step 1: Write the scrape/upsert loop**

Append to `sync/sync_jobs.py`:

```python
def run(dry_run: bool):
    supa = None if dry_run else create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    total_found = 0
    rows_by_fp: dict[str, dict] = {}

    for i, (role, location, is_remote) in enumerate(search_combos()):
        label = f"{role!r} @ {location}{' (remote)' if is_remote else ''}"
        try:
            df = scrape_jobs(
                site_name=SITES,
                search_term=role,
                location=location,
                is_remote=is_remote,
                results_wanted=RESULTS_WANTED,
                hours_old=HOURS_OLD,
                country_indeed="India",
            )
        except Exception as e:
            # One blocked/broken search must not take down the whole run —
            # log it and move on; every combo is independent.
            print(f"[{i}] FAILED {label}: {e}", file=sys.stderr)
            continue

        rows = rows_from_results(df, role)
        total_found += len(rows)
        for row in rows:
            rows_by_fp[row["fingerprint"]] = row  # last write wins within this run
        print(f"[{i}] {label}: {len(rows)} usable rows")
        time.sleep(CALL_DELAY_SECONDS)

    rows = list(rows_by_fp.values())
    if dry_run:
        print(f"DRY RUN: would upsert {len(rows)} unique rows (from {total_found} raw results)")
        return

    for i in range(0, len(rows), 500):
        supa.table("jobs").upsert(rows[i:i + 500], on_conflict="fingerprint").execute()

    cutoff = (datetime.now(timezone.utc) - timedelta(days=PRUNE_AFTER_DAYS)).isoformat()
    supa.table("jobs").delete().lt("synced_at", cutoff).execute()

    print(f"Upserted {len(rows)} unique jobs (from {total_found} raw results across {i // 500 + 1 if rows else 0} batches).")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="scrape and print counts, skip all Supabase writes")
    args = parser.parse_args()
    run(args.dry_run)
```

- [ ] **Step 2: Run a real dry-run to confirm JobSpy integration actually works end to end**

Run: `python sync/sync_jobs.py --dry-run`

This makes real network calls to LinkedIn/Naukri/Indeed (no Supabase credentials needed for `--dry-run`) — expect it to take a few minutes (56 combos × ~3s delay + request time), and expect to see some `[i] FAILED ...` lines in stderr. That's normal: these sites actively rate-limit/block scrapers (JobSpy's own README calls this out under "the board blocked you"), which is exactly why Task 2's error isolation exists. What matters for this check:
- It does not crash — every combo either prints a result count or a `FAILED` line, and the script reaches the final `DRY RUN: would upsert N unique rows` line.
- `N` is greater than 0 (confirms at least some sites returned usable results, not every single combo got blocked).

If `N` is 0, don't proceed to Task 4 — re-run with one combo in isolation (e.g. temporarily shrink `ROLES`/`CITIES` to one entry each) and inspect the `FAILED` message to see whether it's a code bug (fix it) vs. a site block (expected; try again in a few minutes, or from a different network).

- [ ] **Step 3: Commit**

```bash
git add sync/sync_jobs.py
git commit -m "feat: wire up JobSpy scrape loop, Supabase upsert, pruning, dry-run"
```

---

### Task 4: Daily cron workflow

**Files:**
- Create: `.github/workflows/daily-jobs-sync.yml`

**Interfaces:**
- Consumes: `sync/sync_jobs.py` (Task 2+3), `sync/requirements.txt` (Task 2), the existing `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` repo secrets (already used by `daily-sync.yml` — no new secrets to add).

- [ ] **Step 1: Write the workflow**

```yaml
name: Daily Jobs Sync
on:
  schedule:
    # 18:00 UTC == 23:30 IST — offset 30 minutes after daily-sync.yml's
    # 17:30 UTC run so the two cron jobs don't hit Supabase at the same
    # minute.
    - cron: '0 18 * * *'
  workflow_dispatch: {}

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: pip install -r sync/requirements.txt
      - run: python sync/sync_jobs.py
        env:
          SUPABASE_URL:         ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
```

- [ ] **Step 2: Verify the YAML is well-formed**

Run: `ruby -ryaml -e "YAML.load_file('.github/workflows/daily-jobs-sync.yml'); puts 'valid YAML'"`
Expected: `valid YAML` (Ruby ships with macOS, so this needs no new install; this repo has no Python YAML parser available).

- [ ] **Step 3: Diff the structure against the existing workflow for sanity**

Run: `diff <(grep -oE '^\s*(uses|run|runs-on):' .github/workflows/daily-sync.yml) <(grep -oE '^\s*(uses|run|runs-on):' .github/workflows/daily-jobs-sync.yml)`
Expected: only differs by one fewer `run:` line (no `GOOGLE_CREDS_JSON`-style extra step) — confirms the new workflow follows the same shape as the proven one, rather than diverging.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/daily-jobs-sync.yml
git commit -m "feat: add daily GitHub Actions cron for jobs sync"
```

---

### Task 5: Frontend data layer (`app/jobs/page.tsx`)

**Files:**
- Create: `app/jobs/page.tsx`
- Modify: `components/JobsView.tsx` (create in this task too — just the `Job` type + a placeholder default export used by the page; Task 6 fills in the real UI. This keeps the server/client wiring independently testable before the filter UI exists.)

**Interfaces:**
- Consumes: `fetchAllRows<T>(table, select)` from `lib/paged-fetch.ts`, `supabaseServer()` from `lib/supabase-server.ts` — both unchanged, existing exports.
- Produces: `export type Job = { id: number; site: string; title: string; company: string; location: string | null; is_remote: boolean; job_type: string | null; date_posted: string | null; job_url: string; search_role: string }` from `components/JobsView.tsx`, consumed by Task 6 (fills in the real view) and by `app/jobs/page.tsx`.

- [ ] **Step 1: Create a minimal `JobsView` so the page compiles**

```tsx
"use client";

export type Job = {
  id: number;
  site: string;
  title: string;
  company: string;
  location: string | null;
  is_remote: boolean;
  job_type: string | null;
  date_posted: string | null;
  job_url: string;
  search_role: string;
};

export default function JobsView({ initial }: { initial: Job[] }) {
  return <div>{initial.length} jobs loaded</div>;
}
```

- [ ] **Step 2: Write `app/jobs/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { fetchAllRows } from "@/lib/paged-fetch";
import JobsView, { Job } from "@/components/JobsView";

export const dynamic = "force-dynamic";

const getAllJobs = unstable_cache(
  () => fetchAllRows<Job>("jobs", "id,site,title,company,location,is_remote,job_type,date_posted,job_url,search_role"),
  ["all-jobs"],
  { revalidate: 300, tags: ["jobs"] }
);

export default async function Jobs() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const all = await getAllJobs();
  return <JobsView initial={all} />;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/jobs/page.tsx components/JobsView.tsx
git commit -m "feat: add jobs page data layer (server fetch + cache)"
```

---

### Task 6: Filters + full-width job list UI

**Files:**
- Create: `components/JobRow.tsx`
- Modify: `components/JobsView.tsx` (replace Task 5's placeholder body)

**Interfaces:**
- Consumes: the `Job` type (now defined in this same file, unchanged from Task 5).
- Produces: the real `JobsView` default export — same signature as Task 5 (`{ initial: Job[] }`), so `app/jobs/page.tsx` needs no changes.

- [ ] **Step 1: Write `components/JobRow.tsx`**

```tsx
"use client";
import { motion } from "framer-motion";

const JOB_TYPE_LABELS: Record<string, string> = {
  fulltime: "Full-time", parttime: "Part-time", internship: "Internship",
  contract: "Contract", temporary: "Temporary", perdiem: "Per diem",
  volunteer: "Volunteer", other: "Other",
};

function timeAgo(dateIso: string | null): string {
  if (!dateIso) return "";
  const days = Math.floor((Date.now() - new Date(dateIso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

export default function JobRow({
  job, index,
}: {
  job: { id: number; title: string; company: string; location: string | null; is_remote: boolean; job_type: string | null; date_posted: string | null; job_url: string };
  index: number;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.015, 0.3) }}
      className="group relative flex w-full flex-col gap-3 overflow-hidden rounded-2xl border border-edge bg-panel p-5 shadow-card transition-shadow hover:shadow-cardH sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-acad/60 to-transparent" />
      <div className="min-w-0">
        <div className="font-display text-lg leading-snug">{job.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-mute">
          <span className="text-text">{job.company}</span>
          {job.location && <span>· {job.location}</span>}
          {job.is_remote && (
            <span className="rounded-full border border-acad/30 bg-acad/10 px-2.5 py-0.5 text-xs text-acad">Remote</span>
          )}
          {job.job_type && (
            <span className="rounded-full border border-dsml/30 bg-dsml/10 px-2.5 py-0.5 text-xs text-dsml">
              {JOB_TYPE_LABELS[job.job_type] || job.job_type}
            </span>
          )}
          {job.date_posted && <span className="text-xs">Posted {timeAgo(job.date_posted)}</span>}
        </div>
      </div>
      <a
        href={job.job_url}
        target="_blank" rel="noopener noreferrer"
        className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-edge bg-panel2 px-3.5 py-2 text-sm text-text transition hover:border-text/40"
      >
        Apply
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M7 3h10v10h-2V6.4L4.7 16.7 3.3 15.3 13.6 5H7V3z"/></svg>
      </a>
    </motion.article>
  );
}
```

- [ ] **Step 2: Replace `components/JobsView.tsx`'s body with the real filters + list**

```tsx
"use client";
import { useMemo, useState } from "react";
import JobRow from "./JobRow";

export type Job = {
  id: number;
  site: string;
  title: string;
  company: string;
  location: string | null;
  is_remote: boolean;
  job_type: string | null;
  date_posted: string | null;
  job_url: string;
  search_role: string;
};

const CITIES = ["Bangalore", "Hyderabad", "Pune", "Gurgaon", "Mumbai", "Chennai"];
const JOB_TYPE_LABELS: Record<string, string> = {
  fulltime: "Full-time", parttime: "Part-time", internship: "Internship",
  contract: "Contract", temporary: "Temporary", perdiem: "Per diem",
  volunteer: "Volunteer", other: "Other",
};
const POSTED_WITHIN = [
  { label: "Any time", days: null as number | null },
  { label: "Last 24 hours", days: 1 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
];

type State = { q: string; location: string; remoteOnly: boolean; jobType: string; postedDays: number | null };
const DEFAULT_STATE: State = { q: "", location: "All", remoteOnly: false, jobType: "All", postedDays: null };

export default function JobsView({ initial }: { initial: Job[] }) {
  const [state, setState] = useState<State>(DEFAULT_STATE);

  const jobTypes = useMemo(
    () => Array.from(new Set(initial.map(j => j.job_type).filter((t): t is string => !!t))).sort(),
    [initial]
  );

  const filtered = useMemo(() => {
    const qL = state.q.trim().toLowerCase();
    const cutoff = state.postedDays != null ? Date.now() - state.postedDays * 86400000 : null;
    return initial.filter(j => {
      if (qL && !`${j.title} ${j.company}`.toLowerCase().includes(qL)) return false;
      if (state.remoteOnly && !j.is_remote) return false;
      if (state.location !== "All") {
        if (state.location === "Remote") {
          if (!j.is_remote) return false;
        } else if (!(j.location || "").toLowerCase().includes(state.location.toLowerCase())) {
          return false;
        }
      }
      if (state.jobType !== "All" && j.job_type !== state.jobType) return false;
      if (cutoff != null && (!j.date_posted || new Date(j.date_posted).getTime() < cutoff)) return false;
      return true;
    });
  }, [initial, state]);

  return (
    <div className="space-y-8">
      <section>
        <span className="font-mono text-[11px] uppercase tracking-widest text-mute">Apply to jobs</span>
        <h1 className="mt-1 font-display text-4xl leading-tight sm:text-5xl">
          Open roles,<br /><span className="text-mute">refreshed daily.</span>
        </h1>
      </section>

      <section className="flex flex-wrap gap-3">
        <input
          value={state.q}
          onChange={e => setState(s => ({ ...s, q: e.target.value }))}
          placeholder="Search role or company…"
          className="min-w-[200px] flex-1 rounded-xl border border-edge bg-panel px-4 py-2 text-sm text-text placeholder:text-mute focus:border-acad/50 focus:outline-none"
        />
        <select
          value={state.location}
          onChange={e => setState(s => ({ ...s, location: e.target.value }))}
          className="rounded-xl border border-edge bg-panel px-3 py-2 text-sm text-text"
        >
          <option value="All">All locations</option>
          <option value="Remote">Remote</option>
          {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={state.jobType}
          onChange={e => setState(s => ({ ...s, jobType: e.target.value }))}
          className="rounded-xl border border-edge bg-panel px-3 py-2 text-sm text-text"
        >
          <option value="All">All job types</option>
          {jobTypes.map(t => <option key={t} value={t}>{JOB_TYPE_LABELS[t] || t}</option>)}
        </select>
        <select
          value={state.postedDays ?? "any"}
          onChange={e => setState(s => ({ ...s, postedDays: e.target.value === "any" ? null : Number(e.target.value) }))}
          className="rounded-xl border border-edge bg-panel px-3 py-2 text-sm text-text"
        >
          {POSTED_WITHIN.map(p => <option key={p.label} value={p.days ?? "any"}>{p.label}</option>)}
        </select>
        <label className="flex items-center gap-2 rounded-xl border border-edge bg-panel px-3 py-2 text-sm text-mute">
          <input
            type="checkbox"
            checked={state.remoteOnly}
            onChange={e => setState(s => ({ ...s, remoteOnly: e.target.checked }))}
          />
          Remote only
        </label>
      </section>

      <section>
        <div className="mb-3 font-mono text-sm text-mute">
          {filtered.length.toLocaleString()} job{filtered.length === 1 ? "" : "s"}
        </div>
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-edge bg-panel p-10 text-center text-mute">
            Nothing matches these filters yet.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((j, i) => <JobRow key={j.id} job={j} index={i} />)}
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Manual verification (empty-state + filters — Review Focus)**

Run: `npm run dev`, sign in, visit `/jobs`.
- With no rows in the `jobs` table yet (Task 1's migration not applied to your dev DB, or table empty): confirm it renders "Nothing matches these filters yet." — not a blank page or console error.
- If you've run `sync/sync_jobs.py` (without `--dry-run`) against a dev Supabase project so the table has real rows: confirm the search box, location/job-type/posted-within dropdowns, and remote-only checkbox each narrow the list, and an impossible combination (e.g. a nonsense search term) also lands on the same empty state.
- Confirm each row is a single full-width card (not a multi-column grid like `/assignments`), and "Apply" opens the posting in a new tab.

- [ ] **Step 5: Commit**

```bash
git add components/JobRow.tsx components/JobsView.tsx
git commit -m "feat: add Apply to Jobs filters and full-width job list"
```

---

### Task 7: Nav link

**Files:**
- Modify: `components/Header.tsx:76-83` (the `<nav>` block)

**Interfaces:**
- Consumes: the existing `tab(href, label, external?)` helper already in `Header.tsx` (unchanged).

- [ ] **Step 1: Add the tab**

In `components/Header.tsx`, inside the `<nav>` block:

```tsx
{tab("/", "Questions")}
{tab("/assignments", "Assignments")}
{tab("/packets", "Prepare for Trending roles")}
{tab("/jobs", "Apply to Jobs")}
{isAdmin && tab("/admin", "Admin")}
{tab("https://cortex-by-scaler.up.railway.app/login", "Revise with Crash Course", true)}
```

(Only the `{tab("/jobs", "Apply to Jobs")}` line is new — it's inserted before the `isAdmin` line, keeping Admin and the external Crash Course link in their existing positions.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, sign in, confirm "Apply to Jobs" appears in the nav and routes to `/jobs`, and that it doesn't visually break the nav layout (this plan doesn't touch the separate nav-overflow/Admin-dropdown work discussed earlier in the conversation — that's still pending its own implementation).

- [ ] **Step 4: Commit**

```bash
git add components/Header.tsx
git commit -m "feat: add Apply to Jobs nav link"
```

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
PRUNE_AFTER_DAYS = 7
# Pause between scrape_jobs() calls so ~56 back-to-back requests don't trip
# a site's rate limiter any faster than normal, spaced-out traffic would.
# Sites may still block some calls regardless (see the per-call try/except
# in run()) — that's expected and handled, not prevented, by this delay.
CALL_DELAY_SECONDS = 3
# Job boards match search terms loosely (e.g. Naukri returning "Branch Head
# - SME Loans" or "HR Assistant" for a "Program Manager"/"Engineering
# Manager" search, matching on the generic word "Manager" rather than the
# actual role) — this allowlist is the gate that keeps those out. A title
# must contain at least one of these to be stored.
RELEVANT_KEYWORDS = [
    "engineer", "developer", "sde", "swe", "software",
    "data scientist", "data analyst", "data engineer",
    "machine learning",
    "forward deployed",
    "program manager", "programme manager", "technical program",
    "product manager",
]

def is_relevant_title(title: str) -> bool:
    t = title.lower()
    return any(k in t for k in RELEVANT_KEYWORDS)

def norm(s):
    # A missing cell from df.to_dict("records") isn't always None — for
    # JobSpy's string-dtype columns it comes back as float('nan'), which
    # str()'s straight to the literal text "nan" if not caught here.
    if s is None or (isinstance(s, float) and pd.isna(s)):
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
        if not is_relevant_title(title):
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
            # Supabase's `default now()` only fires on INSERT, never on an
            # upsert's UPDATE path — set it explicitly on every row so a
            # posting that's still being found every day keeps its freshness
            # clock current, instead of aging past PRUNE_AFTER_DAYS from its
            # original insert while still actually live.
            "synced_at": datetime.now(timezone.utc).isoformat(),
        })
    return out

def prune_irrelevant(supa) -> int:
    """Sweeps out rows stored before the RELEVANT_KEYWORDS gate existed (or
    from before a keyword-list change) — a one-time-per-change cleanup, not
    the staleness prune below. Paged select + chunked delete, same shape as
    sync_sheet.py's select_all/delete_stale."""
    PAGE = 1000
    bad_ids = []
    frm = 0
    while True:
        res = supa.table("jobs").select("id,title").range(frm, frm + PAGE - 1).execute()
        rows = res.data or []
        bad_ids.extend(r["id"] for r in rows if not is_relevant_title(r["title"]))
        if len(rows) < PAGE:
            break
        frm += PAGE
    for i in range(0, len(bad_ids), 200):
        supa.table("jobs").delete().in_("id", bad_ids[i:i + 200]).execute()
    return len(bad_ids)

def run(dry_run: bool, sweep_irrelevant: bool = False):
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

        # JobSpy catches each site's own scraper errors internally and
        # reports them here instead of raising — a blocked/broken site
        # still returns a (possibly empty) DataFrame from other sites, so
        # the try/except above never sees it. Surface it explicitly so a
        # partially-blocked run is visible in the log, not just a lower
        # row count with no indication why.
        site_errors = getattr(df, "attrs", {}).get("errors") or {}
        for site, error in site_errors.items():
            print(f"[{i}] {label}: {site} failed: {error}", file=sys.stderr)

        rows = rows_from_results(df, role)
        total_found += len(rows)
        for row in rows:
            rows_by_fp[row["fingerprint"]] = row  # last write wins within this run
        print(f"[{i}] {label}: {len(rows)} usable rows")
        time.sleep(CALL_DELAY_SECONDS)

    rows = list(rows_by_fp.values())
    if total_found == 0:
        # Every combo either errored or came back empty — could be a
        # code/config bug, or every site blocking this run outright.
        # Exit 0 either way (a transient block shouldn't fail the cron and
        # start paging someone), but make it loud in the log.
        print("WARNING: 0 rows scraped across every search combo this run.", file=sys.stderr)

    if dry_run:
        print(f"DRY RUN: would upsert {len(rows)} unique rows (from {total_found} raw results)")
        return

    for i in range(0, len(rows), 500):
        supa.table("jobs").upsert(rows[i:i + 500], on_conflict="fingerprint").execute()

    cutoff = (datetime.now(timezone.utc) - timedelta(days=PRUNE_AFTER_DAYS)).isoformat()
    supa.table("jobs").delete().lt("synced_at", cutoff).execute()

    # New rows are already filtered by is_relevant_title() before they're
    # stored, so re-reading the whole table every night only matters after
    # RELEVANT_KEYWORDS changes. Run with --sweep-irrelevant when it does.
    irrelevant_removed = prune_irrelevant(supa) if sweep_irrelevant else 0

    # Tell the website its cached Jobs list is out of date (see
    # lib/cached-table.ts). Never fails the sync if the table isn't there.
    try:
        supa.table("cache_versions").upsert(
            {"name": "jobs", "updated_at": datetime.now(timezone.utc).isoformat()}, on_conflict="name"
        ).execute()
    except Exception as e:
        print(f"cache_versions bump skipped: {e}", file=sys.stderr)

    print(f"Upserted {len(rows)} unique jobs (from {total_found} raw results across {i // 500 + 1 if rows else 0} batches). "
          f"Removed {irrelevant_removed} pre-existing off-topic rows.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="scrape and print counts, skip all Supabase writes")
    parser.add_argument("--sweep-irrelevant", action="store_true", help="also re-check every stored job against RELEVANT_KEYWORDS (only needed after that list changes)")
    args = parser.parse_args()
    run(args.dry_run, args.sweep_irrelevant)

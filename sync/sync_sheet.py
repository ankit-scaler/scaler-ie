"""
Daily sync: Google Sheet <-> Supabase.
Reads 4 Question tabs + Assignments tab, dedupes, upserts by fingerprint.
Also writes tracking-insights snapshots (the same breakdowns Admin can
export as CSV) out to subsheets of a separate tracking spreadsheet.
"""
import os, json, hashlib, sys, re, time
from datetime import datetime, timedelta, timezone
import requests
import gspread
from google.oauth2.service_account import Credentials
from supabase import create_client
from topics import load_classifier

SHEET_ID = os.environ["SHEET_ID"]
SUPA_URL = os.environ["SUPABASE_URL"]
SUPA_KEY = os.environ["SUPABASE_SERVICE_KEY"]
CREDS    = json.loads(os.environ["GOOGLE_CREDS_JSON"])
# Separate spreadsheet that gates who can sign in at all (app/auth/callback
# checks this table). Optional so this script keeps working if it's unset —
# just skips that part of the sync rather than erroring the whole job out.
LEARNERS_SHEET_ID = os.environ.get("LEARNERS_SHEET_ID")
# Separate spreadsheet that tracking-insight snapshots get written OUT to
# (Admin's CSV exports, mirrored into subsheets). Optional, same reasoning.
TRACKING_SHEET_ID = os.environ.get("TRACKING_SHEET_ID")
# AI topic classification (see topics.py, Gemini API). Optional, same
# reasoning — skips cleanly so a missing key never blocks the actual sync.
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
# Internal Scaler accounts (content team, admins, anyone poking at the site)
# aren't learners, so their activity must not inflate any tracking number.
# Excluded at read time rather than at write time: the app keeps recording
# every row, so this stays reversible and no history is thrown away. The
# Admin stats API (app/api/admin/stats/route.ts) applies the same exclusion,
# so this spreadsheet and the Tracking tab never disagree.
INTERNAL_EMAIL_PATTERN = "%@scaler.com"
# Caps how many rows one nightly run will classify directly (one call each).
# Normal nights only have a handful of new questions; this just bounds the
# worst case (someone bulk-pastes thousands of rows into the sheet in one
# day) so the job can't balloon in cost or runtime — any rows left over
# just get picked up on the next run. The big one-off reclassification of
# *all* rows (new or already-classified) belongs to backfill_topics.py, not
# here — run it by hand whenever classification quality needs a re-pass.
CLASSIFY_CAP = 300
# Matches backfill_topics.py's MAX_RETRIES — same 429 backoff, same ceiling.
CLASSIFY_MAX_RETRIES = 5
# Opt-in "hard refresh": also deletes questions/assignments rows whose
# fingerprint is no longer present in the sheet. Off by default — normal
# syncs only add/update, never delete, so an admin edit or a manual sheet
# row removal doesn't silently wipe data. Triggered from Admin -> Hard
# refresh, or the workflow_dispatch "full_resync" checkbox.
FULL_RESYNC = os.environ.get("FULL_RESYNC", "").strip().lower() == "true"

# Google's Sheets API returns transient 429/5xx errors under load (the
# nightly cron has hit "[503]: The service is currently unavailable" on a
# bare gc.open_by_key). None of these are our fault and they clear on their
# own within seconds, so wrap every Sheets network call that would abort the
# job in this exponential backoff instead of failing the whole run.
GS_MAX_RETRIES = 5
GS_RETRY_CODES = {429, 500, 502, 503, 504}

def gs_retry(fn, *args, **kwargs):
    """Call fn(*args, **kwargs), retrying transient gspread APIErrors with
    exponential backoff (2s, 4s, 8s, ...). Re-raises anything else, and
    re-raises the transient error too once retries are exhausted."""
    delay = 2
    for attempt in range(GS_MAX_RETRIES):
        try:
            return fn(*args, **kwargs)
        except gspread.exceptions.APIError as e:
            code = getattr(e, "code", None) or getattr(
                getattr(e, "response", None), "status_code", None)
            if code in GS_RETRY_CODES and attempt < GS_MAX_RETRIES - 1:
                print(f"sheets API {code}, retrying in {delay}s "
                      f"(attempt {attempt + 1}/{GS_MAX_RETRIES})", file=sys.stderr)
                time.sleep(delay)
                delay *= 2
                continue
            raise

def delete_stale(supa, table, kept_fingerprints, only_where_null=None):
    """Deletes rows in `table` whose fingerprint isn't in kept_fingerprints.
    Only called under FULL_RESYNC, after a successful fresh read+upsert —
    never as a first step, so a bad sheet read can't wipe good data.
    If only_where_null is a column name, rows are only considered when that
    column IS NULL — e.g. "added_by", so an admin-added assignment (not
    sourced from the sheet at all) is never swept up in a hard refresh."""
    existing = select_all(supa, table, "id,fingerprint", is_null_col=only_where_null)
    stale_ids = [r["id"] for r in existing if r["fingerprint"] not in kept_fingerprints]
    for i in range(0, len(stale_ids), 200):
        supa.table(table).delete().in_("id", stale_ids[i:i+200]).execute()
    if stale_ids:
        print(f"{table}: hard refresh removed {len(stale_ids)} stale row(s)")

def select_all(supa, table, select_cols, is_null_col=None):
    """PostgREST caps a single select at 1000 rows by default — this pages
    through with .range() until a short page signals the end, so tables like
    `questions` (10k+ rows) get checked in full instead of silently only
    the first 1000."""
    PAGE = 1000
    out, frm = [], 0
    while True:
        q = supa.table(table).select(select_cols)
        if is_null_col:
            q = q.is_(is_null_col, "null")
        res = q.range(frm, frm + PAGE - 1).execute()
        rows = res.data or []
        out.extend(rows)
        if len(rows) < PAGE:
            break
        frm += PAGE
    return out

QUESTION_TABS = {
    "Questions | Academy": {"round_col": "Round"},
    "Questions | DevOps":  {"round_col": "# Round - Name"},
    "Questions | AIML":    {"round_col": "Round"},
    "Questions | DSML":    {"round_col": "# Round - Name"},
    "Questions | FDE":     {"round_col": "Round"},
}
ASSIGNMENT_TAB = "Assignments"
LEARNERS_TAB = "Main"
LEARNERS_EMAIL_COL = 4  # Column D, 1-indexed

def norm(s):
    if s is None: return ""
    return str(s).strip()

def fp(*parts):
    return hashlib.sha256("||".join(str(p or "") for p in parts).encode()).hexdigest()

def dedupe_headers(headers):
    seen, out = {}, []
    for i, h in enumerate(headers):
        h = (h or "").strip() or f"_col{i}"
        if h in seen:
            seen[h] += 1
            out.append(f"{h}__{seen[h]}")
        else:
            seen[h] = 0
            out.append(h)
    return out

def get_col(row, name):
    target = name.strip().lower()
    for k, v in row.items():
        if k.strip().lower() == target:
            return norm(v)
    return ""

def dedupe_by_fp(rows):
    seen, out = set(), []
    for r in rows:
        f = r["fingerprint"]
        if f in seen: continue
        seen.add(f)
        out.append(r)
    return out

def col_letter(col_idx1):
    return re.sub(r"\d+$", "", gspread.utils.rowcol_to_a1(1, col_idx1))

def fetch_column_hyperlinks(sh, tab_name, col_idx1, n_rows):
    """Real URL behind each data-row cell in this column (row 2..n_rows+1),
    however it was attached: a =HYPERLINK() formula, a whole-cell "Insert
    link", or a link applied to just part of the cell's text (the common case
    when the display text is a label like "Assignment Link" rather than the
    URL itself — plain get_all_values() can't see that link at all).
    None where a row has no link. Padded/truncated to length n_rows.
    """
    if not col_idx1 or n_rows <= 0:
        return []
    col = col_letter(col_idx1)
    rng = f"'{tab_name}'!{col}2:{col}{n_rows + 1}"
    try:
        meta = sh.fetch_sheet_metadata(params={
            "ranges": rng,
            "fields": "sheets.data.rowData.values(hyperlink,textFormatRuns.format.link.uri)",
        })
        row_data = meta["sheets"][0]["data"][0].get("rowData", [])
    except Exception as e:
        print(f"fetch_column_hyperlinks failed: {e}", file=sys.stderr)
        row_data = []

    out = []
    for r in row_data:
        vals = r.get("values") or [{}]
        cell = vals[0] if vals else {}
        link = cell.get("hyperlink")
        if not link:
            for run in cell.get("textFormatRuns") or []:
                uri = (run.get("format") or {}).get("link", {}).get("uri")
                if uri:
                    link = uri; break
        out.append(link)
    out += [None] * (n_rows - len(out))
    return out

def sync_allowed_learners(gc, supa):
    """Full replace of the sheet-managed rows in allowed_learners (Main tab,
    column D). Rows an admin granted manually via the website (added_by set)
    are never touched here — only the delete step is scoped to added_by is
    null, so a manual grant survives even if the sheet doesn't list that
    email. Refuses to touch the table at all if the sheet read fails or
    produces zero emails — a bad read should never lock every learner out."""
    if not LEARNERS_SHEET_ID:
        print("LEARNERS_SHEET_ID not set, skipping learner allow-list sync", file=sys.stderr)
        return
    try:
        lsh = gs_retry(gc.open_by_key, LEARNERS_SHEET_ID)
        ws = gs_retry(lsh.worksheet, LEARNERS_TAB)
        all_vals = gs_retry(ws.get_all_values)
    except Exception as e:
        print(f"learner allow-list: failed to read sheet, skipping: {e}", file=sys.stderr)
        return

    emails = set()
    for raw in all_vals[1:]:
        if len(raw) < LEARNERS_EMAIL_COL:
            continue
        e = norm(raw[LEARNERS_EMAIL_COL - 1]).lower()
        if "@" in e:
            emails.add(e)

    if not emails:
        print("learner allow-list: sheet produced 0 emails, refusing to sync (would lock everyone out)", file=sys.stderr)
        return

    now = datetime.utcnow().isoformat()
    # added_by explicitly null: if a manually-granted email later shows up in
    # the sheet too, it becomes sheet-managed from here on — expected.
    rows = [{"email": e, "synced_at": now, "added_by": None} for e in emails]
    for i in range(0, len(rows), 500):
        supa.table("allowed_learners").upsert(rows[i:i+500], on_conflict="email").execute()

    existing = select_all(supa, "allowed_learners", "email", is_null_col="added_by")
    stale = [r["email"] for r in existing if r["email"] not in emails]
    for i in range(0, len(stale), 200):
        supa.table("allowed_learners").delete().in_("email", stale[i:i+200]).execute()
    print(f"learner allow-list: synced {len(emails)} emails, removed {len(stale)} stale")

def select_paged(supa, table, select_cols, since_iso, date_col):
    """Same idea as select_all, but with an optional `since` lower bound and
    an explicit order so pagination across pages stays consistent. Every
    caller is a tracking table keyed by user_email, so internal Scaler
    accounts are dropped here once instead of in each builder below."""
    PAGE = 1000
    out, frm = [], 0
    while True:
        q = supa.table(table).select(select_cols).order("id")
        q = q.not_.ilike("user_email", INTERNAL_EMAIL_PATTERN)
        if since_iso:
            q = q.gte(date_col, since_iso)
        res = q.range(frm, frm + PAGE - 1).execute()
        rows = res.data or []
        out.extend(rows)
        if len(rows) < PAGE:
            break
        frm += PAGE
    return out

# India Standard Time is a fixed +05:30 (no DST): the same anchor as the app
# (app/api/admin/stats/route.ts, lib/tracking-tables.ts), so every date and time
# in the tracking sheet matches what the Tracking page shows. Stored timestamps
# are UTC; they are converted here, never sliced.
IST = timezone(timedelta(hours=5, minutes=30))

def _to_ist(ts):
    if not ts:
        return None
    s = str(ts).strip().replace("Z", "+00:00")
    # Python 3.10's fromisoformat needs 3 or 6 fractional digits; Postgres can
    # return 1-6. Normalise to 6 so any supported Python version parses it.
    s = re.sub(r"(\.\d+)", lambda m: m.group(1)[:7].ljust(7, "0"), s, count=1)
    d = datetime.fromisoformat(s)
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(IST)

def _fmt_ts(ts):
    d = _to_ist(ts)
    return d.strftime("%Y-%m-%d %H:%M:%S") if d else ""

def _ist_date(ts):
    d = _to_ist(ts)
    return d.strftime("%Y-%m-%d") if d else ""

def last_30d_since_iso(now=None):
    """Start of the 'Last 30d' window: IST midnight 29 days ago, i.e. today plus
    the 29 days before it — exactly the app's 30D range."""
    today = (now or datetime.now(timezone.utc)).astimezone(IST).date()
    start = datetime(today.year, today.month, today.day, tzinfo=IST) - timedelta(days=29)
    return start.astimezone(timezone.utc).isoformat()

# Each builder mirrors the equivalent grouping logic in AdminDashboard.tsx —
# same grain, same columns — so a subsheet and its CSV-export counterpart on
# the website never tell a different story.
def build_usage_summary(views, sessions, packet_views):
    m = {}
    def touch(email, ts):
        e = m.setdefault(email, {"views": 0, "packetsRead": 0, "last": ts})
        if ts > e["last"]: e["last"] = ts
        return e
    for v in views: touch(v["user_email"], v["created_at"])["views"] += 1
    for s in sessions: touch(s["user_email"], s["started_at"])
    for p in packet_views: touch(p["user_email"], p["created_at"])["packetsRead"] += 1
    rows = [["Email", "Views", "Packets Read", "Last Activity (IST)"]]
    for email in sorted(m):
        e = m[email]
        rows.append([email, e["views"], e["packetsRead"], _fmt_ts(e["last"])])
    return rows

def build_daily_visits(sessions):
    rows = [["Email", "Date (IST)", "Time (IST)"]]
    for s in sorted(sessions, key=lambda r: r["started_at"], reverse=True):
        d = _to_ist(s["started_at"])
        rows.append([s["user_email"], d.strftime("%Y-%m-%d") if d else "", d.strftime("%H:%M:%S") if d else ""])
    return rows

def build_topic_breakdown(views):
    m = {}
    for v in views:
        topic = (v.get("topic") or "").strip()
        if not topic: continue
        key = (v["user_email"], topic)
        e = m.setdefault(key, {"count": 0, "first": v["created_at"], "last": v["created_at"]})
        e["count"] += 1
        if v["created_at"] < e["first"]: e["first"] = v["created_at"]
        if v["created_at"] > e["last"]: e["last"] = v["created_at"]
    rows = [["Topic", "Email", "First time date (IST)", "Last time date (IST)", "Count"]]
    for (email, topic), e in sorted(m.items(), key=lambda kv: kv[1]["last"], reverse=True):
        rows.append([topic, email, _fmt_ts(e["first"]), _fmt_ts(e["last"]), e["count"]])
    return rows

def build_company_role_breakdown(views):
    m = {}
    for v in views:
        company, role = (v.get("company") or "").strip(), (v.get("role") or "").strip()
        if not (company and role): continue
        program = (v.get("program") or "").strip() or "—"
        key = (v["user_email"], program, company, role)
        e = m.setdefault(key, {"count": 0, "first": v["created_at"], "last": v["created_at"]})
        e["count"] += 1
        if v["created_at"] < e["first"]: e["first"] = v["created_at"]
        if v["created_at"] > e["last"]: e["last"] = v["created_at"]
    rows = [["Program", "Company", "Role", "Email", "First time date (IST)", "Last time date (IST)", "Count"]]
    for (email, program, company, role), e in sorted(m.items(), key=lambda kv: kv[1]["last"], reverse=True):
        rows.append([program, company, role, email, _fmt_ts(e["first"]), _fmt_ts(e["last"]), e["count"]])
    return rows

def build_packet_reads(packet_views):
    m = {}
    for v in packet_views:
        p = v.get("packets") or {}
        packet = f"{p.get('role') or '—'} · {p.get('yoe') or '—'}"
        key = (v["user_email"], packet)
        e = m.setdefault(key, {"count": 0, "first": v["created_at"], "last": v["created_at"]})
        e["count"] += 1
        if v["created_at"] < e["first"]: e["first"] = v["created_at"]
        if v["created_at"] > e["last"]: e["last"] = v["created_at"]
    rows = [["Packet", "Email", "First read (IST)", "Last read (IST)", "Count"]]
    for (email, packet), e in sorted(m.items(), key=lambda kv: kv[1]["last"], reverse=True):
        rows.append([packet, email, _fmt_ts(e["first"]), _fmt_ts(e["last"]), e["count"]])
    return rows

def build_assignment_opens(assignment_views):
    m = {}
    for v in assignment_views:
        a = v.get("assignments") or {}
        rnd = a.get("round")
        assignment = f"{a.get('company') or '—'} — {a.get('role') or '—'}" + (f" · {rnd}" if rnd else "")
        key = (v["user_email"], assignment)
        e = m.setdefault(key, {"count": 0, "first": v["created_at"], "last": v["created_at"]})
        e["count"] += 1
        if v["created_at"] < e["first"]: e["first"] = v["created_at"]
        if v["created_at"] > e["last"]: e["last"] = v["created_at"]
    rows = [["Assignment", "Email", "First opened (IST)", "Last opened (IST)", "Count"]]
    for (email, assignment), e in sorted(m.items(), key=lambda kv: kv[1]["last"], reverse=True):
        rows.append([assignment, email, _fmt_ts(e["first"]), _fmt_ts(e["last"]), e["count"]])
    return rows

def build_video_watches(video_views):
    m = {}
    for v in video_views:
        vr = v.get("video_resources") or {}
        p = vr.get("packets") or {}
        video = f"{vr.get('topic') or '—'} ({p.get('role') or '—'} · {p.get('yoe') or '—'})"
        key = (v["user_email"], video)
        e = m.setdefault(key, {"count": 0, "first": v["created_at"], "last": v["created_at"]})
        e["count"] += 1
        if v["created_at"] < e["first"]: e["first"] = v["created_at"]
        if v["created_at"] > e["last"]: e["last"] = v["created_at"]
    rows = [["Video", "Email", "First watched (IST)", "Last watched (IST)", "Count"]]
    for (email, video), e in sorted(m.items(), key=lambda kv: kv[1]["last"], reverse=True):
        rows.append([video, email, _fmt_ts(e["first"]), _fmt_ts(e["last"]), e["count"]])
    return rows

def build_feedback_rows(feedback):
    rows = [["Email", "Platform Rating", "Usefulness Rating", "Feedback", "Submitted At (IST)"]]
    for f in sorted(feedback, key=lambda r: r["created_at"], reverse=True):
        rows.append([
            f["user_email"], f["platform_rating"], f["usefulness_rating"],
            f.get("feedback_text") or "", _fmt_ts(f["created_at"]),
        ])
    return rows

# ---- Resumes (model_resume_event) -----------------------------------------
# Python twins of lib/resume-tracking.ts: same grains, columns, labels and
# ordering, so a sheet tab and the matching CSV export never disagree.
RESUME_EXP_LABELS = {"fresher": "Fresher (under 1 yr)", "1-4": "1–4 yrs", "5-10": "5–10 yrs", "10plus": "10+ yrs"}
RESUME_BG_LABELS = {"cs": "CS/IT degree", "noncs": "Non-CS degree", "same": "Same domain",
                    "different": "Different tech domain", "switcher": "Switching from non-tech"}

def _resume_facet(labels, v):
    s = v if isinstance(v, str) else ""
    return "All" if (not s or s == "All") else labels.get(s, s)

def _resume_name(e):
    r = e.get("model_resume") or {}
    if r.get("program"):
        return f"{r['program']} · {r.get('exp_label') or '—'} · {r.get('background_label') or '—'}"
    return e.get("slug") or "—"

def _resume_sorted(rows, last_key="last"):
    """Newest first; ties broken by email then the remaining text columns
    (ascending), matching byLastDesc in lib/resume-tracking.ts."""
    rows = sorted(rows, key=lambda r: tuple(str(x) for x in r["tiebreak"]))
    return sorted(rows, key=lambda r: r[last_key], reverse=True)

def _resume_per_resume(events, kind, headers):
    m = {}
    for e in events:
        if e["kind"] != kind: continue
        ts = e["at"]
        k = (e["user_email"], _resume_name(e))
        a = m.setdefault(k, {"count": 0, "first": ts, "last": ts})
        a["count"] += 1
        if ts < a["first"]: a["first"] = ts
        if ts > a["last"]: a["last"] = ts
    items = [{"email": k[0], "resume": k[1], "tiebreak": (k[0], k[1]), **v} for k, v in m.items()]
    rows = [headers]
    for r in _resume_sorted(items):
        rows.append([r["email"], r["resume"], _fmt_ts(r["first"]), _fmt_ts(r["last"]), r["count"]])
    return rows

def build_resume_opens(events):
    return _resume_per_resume(events, "resume_view", ["Email", "Resume", "First opened (IST)", "Last opened (IST)", "Count"])

def build_resume_downloads(events):
    return _resume_per_resume(events, "pdf_download", ["Email", "Resume", "First downloaded (IST)", "Last downloaded (IST)", "Count"])

def build_resume_clicks(events):
    m = {}
    for e in events:
        if e["kind"] not in ("note_open", "see_example"): continue
        k = (e["user_email"], _resume_name(e))
        r = m.setdefault(k, {"email": k[0], "resume": k[1], "notes": 0, "examples": 0, "last": e["at"], "tiebreak": (k[0], k[1])})
        if e["kind"] == "note_open": r["notes"] += 1
        else: r["examples"] += 1
        if e["at"] > r["last"]: r["last"] = e["at"]
    rows = [["Email", "Resume", "Notes opened", "See it in this resume clicks", "Last click (IST)"]]
    for r in _resume_sorted(m.values()):
        rows.append([r["email"], r["resume"], r["notes"], r["examples"], _fmt_ts(r["last"])])
    return rows

def build_resume_filters(events):
    m = {}
    for e in events:
        if e["kind"] != "filter": continue
        d = e.get("detail") or {}
        p = d.get("program") if isinstance(d.get("program"), str) and d.get("program") else "All"
        k = (e["user_email"], p, _resume_facet(RESUME_EXP_LABELS, d.get("band")), _resume_facet(RESUME_BG_LABELS, d.get("bg")))
        a = m.setdefault(k, {"count": 0, "first": e["at"], "last": e["at"]})
        a["count"] += 1
        if e["at"] < a["first"]: a["first"] = e["at"]
        if e["at"] > a["last"]: a["last"] = e["at"]
    items = [{"key": k, "tiebreak": (k[0], k[1], k[2], k[3]), **v} for k, v in m.items()]
    rows = [["Email", "Programme", "Experience", "Background", "First applied (IST)", "Last applied (IST)", "Count"]]
    for r in _resume_sorted(items):
        email, p, x, b = r["key"]
        rows.append([email, p, x, b, _fmt_ts(r["first"]), _fmt_ts(r["last"]), r["count"]])
    return rows

def build_resume_review_clicks(events):
    m = {}
    for e in events:
        if e["kind"] not in ("mentor_cta", "mentor_dashboard_cta"): continue
        k = (e["user_email"], _resume_name(e))
        r = m.setdefault(k, {"email": k[0], "resume": k[1], "header": 0, "end": 0, "dashboard": 0, "last": e["at"], "tiebreak": (k[0], k[1])})
        if e["kind"] == "mentor_dashboard_cta": r["dashboard"] += 1
        elif (e.get("detail") or {}).get("from") == "end": r["end"] += 1
        else: r["header"] += 1
        if e["at"] > r["last"]: r["last"] = e["at"]
    rows = [["Email", "Resume", "Header button", "End-of-page button", "Went to Scaler dashboard", "Last click (IST)"]]
    for r in _resume_sorted(m.values()):
        rows.append([r["email"], r["resume"], r["header"], r["end"], r["dashboard"], _fmt_ts(r["last"])])
    return rows

def build_page_visits(views, path):
    """Who opened a page (e.g. "/packets" = Trending roles): one row per
    learner with first/last visit and count. Twin of buildPageVisitByEmail in
    lib/page-visit-tracking.ts — same columns and ordering (newest last visit
    first, ties by email)."""
    m = {}
    for v in views:
        if v.get("path") != path: continue
        r = m.setdefault(v["user_email"], {"email": v["user_email"], "first": v["created_at"], "last": v["created_at"], "count": 0})
        r["count"] += 1
        if v["created_at"] < r["first"]: r["first"] = v["created_at"]
        if v["created_at"] > r["last"]: r["last"] = v["created_at"]
    rows = [["Email", "First visit (IST)", "Last visit (IST)", "Count"]]
    ordered = sorted(m.values(), key=lambda r: r["email"])
    for r in sorted(ordered, key=lambda r: r["last"], reverse=True):
        rows.append([r["email"], _fmt_ts(r["first"]), _fmt_ts(r["last"]), r["count"]])
    return rows

# ---- Daily tables: twins of lib/tracking-tables.ts. One row per learner per IST
# day (or per learner+item per day); newest day first, then email, then item/type
# (ascending, ordinal) — identical ordering to the app's CSV exports.
def _daily_rows(rows, email_key, ts_key):
    seen, out = set(), []
    for r in rows:
        email, date = r[email_key], _ist_date(r[ts_key])
        if (email, date) in seen: continue
        seen.add((email, date))
        out.append((email, date))
    return sorted(out, key=lambda x: (-int(x[1].replace("-", "")) if x[1] else 0, x[0]))

def _daily_item_rows(rows, email_key, item_fn, ts_key):
    seen, out = set(), []
    for r in rows:
        email, item, date = r[email_key], item_fn(r), _ist_date(r[ts_key])
        if (email, item, date) in seen: continue
        seen.add((email, item, date))
        out.append((email, item, date))
    # newest day first; ties by email then item, both ascending
    out.sort(key=lambda x: (x[0], x[1]))
    out.sort(key=lambda x: x[2], reverse=True)
    return out

def build_daily_visitors(sessions):
    """Unique learners per IST day (the app's 'Daily Visits (Opened App)' export)."""
    rows = [["Email", "Date (IST)"]]
    for email, date in sorted(sorted(_daily_rows(sessions, "user_email", "started_at"), key=lambda x: x[0]), key=lambda x: x[1], reverse=True):
        rows.append([email, date])
    return rows

def _is_search_view(v):
    return bool(v.get("company") or v.get("role") or v.get("topic"))

def build_daily_searches(views):
    """Learners who narrowed Questions/Assignments to a company, role or topic, once per day."""
    rows = [["Email", "Date (IST)"]]
    base = [v for v in views if _is_search_view(v)]
    for email, date in sorted(sorted(_daily_rows(base, "user_email", "created_at"), key=lambda x: x[0]), key=lambda x: x[1], reverse=True):
        rows.append([email, date])
    return rows

def build_daily_page_visits(views, path):
    """Learners who opened a page (by path), once per IST day."""
    rows = [["Email", "Date (IST)"]]
    base = [v for v in views if v.get("path") == path]
    for email, date in sorted(sorted(_daily_rows(base, "user_email", "created_at"), key=lambda x: x[0]), key=lambda x: x[1], reverse=True):
        rows.append([email, date])
    return rows

def build_daily_content_engagement(packet_views, video_views):
    """Learners who opened a Trending roles packet or a video link, once per day each."""
    items = [(e, d, "Read a packet") for e, d in _daily_rows(packet_views, "user_email", "created_at")] + \
            [(e, d, "Watched a video") for e, d in _daily_rows(video_views, "user_email", "created_at")]
    items.sort(key=lambda x: (x[0], x[2]))
    items.sort(key=lambda x: x[1], reverse=True)
    return [["Email", "Date (IST)", "Type"]] + [[e, d, ty] for e, d, ty in items]

def build_job_apply_clicks(job_applies):
    rows = [["Email", "Job ID", "Date (IST)"]]
    for email, item, date in _daily_item_rows(job_applies, "user_email", lambda r: str(r["job_id"]), "created_at"):
        rows.append([email, item, date])
    return rows

def build_company_packet_opens(opens):
    rows = [["Email", "Packet", "Date (IST)"]]
    for email, item, date in _daily_item_rows(opens, "user_email", lambda r: str(r["slug"]), "created_at"):
        rows.append([email, item, date])
    return rows

def select_packet_requests(supa):
    """Packet requests that got escalated to Slack (no existing packet was
    found for that company+role) — matched requests need no human follow-up,
    so they're excluded here. Not windowed by All-time/Last-30d like the
    rest of sync_tracking_to_sheet: request volume is low, so one running
    log is more useful than two near-identical windows."""
    PAGE = 1000
    out, frm = [], 0
    while True:
        res = (supa.table("packet_requests")
               .select("user_email,contact_number,company,role,jd_text,interview_date,created_at")
               .eq("slack_notified", True)
               .order("created_at", desc=True)
               .range(frm, frm + PAGE - 1).execute())
        rows = res.data or []
        out.extend(rows)
        if len(rows) < PAGE:
            break
        frm += PAGE
    return out

def build_packet_requests_rows(requests):
    rows = [["Email", "Contact", "Company", "Role", "JD", "Interview/Assessment Date", "Requested At (IST)"]]
    for r in requests:
        rows.append([
            r["user_email"], r.get("contact_number") or "", r["company"], r["role"],
            (r.get("jd_text") or "")[:500], r.get("interview_date") or "", _fmt_ts(r["created_at"]),
        ])
    return rows

def write_subsheet(tsh, title, rows):
    try:
        ws = gs_retry(tsh.worksheet, title)
        gs_retry(ws.clear)
    except gspread.exceptions.WorksheetNotFound:
        cols = len(rows[0]) if rows else 8
        ws = gs_retry(tsh.add_worksheet, title=title, rows=max(len(rows) + 10, 100), cols=max(cols + 2, 8))
    if rows:
        gs_retry(ws.update, rows)
    print(f"tracking sheet: wrote {max(len(rows) - 1, 0)} row(s) to {title!r}")

def sync_tracking_to_sheet(gc, supa):
    """Mirrors every Admin CSV export into its own subsheet of a separate
    tracking spreadsheet — both an all-time and a rolling-30-day version of
    each. Full-replace each run (not append): a subsheet always reflects
    exactly the current database state, same as everything else this script
    writes. Optional: skips cleanly if TRACKING_SHEET_ID isn't set."""
    if not TRACKING_SHEET_ID:
        print("TRACKING_SHEET_ID not set, skipping tracking-insights export", file=sys.stderr)
        return
    try:
        tsh = gs_retry(gc.open_by_key, TRACKING_SHEET_ID)
    except Exception as e:
        print(f"tracking sheet: failed to open, skipping: {e}", file=sys.stderr)
        return

    thirty_days_ago = last_30d_since_iso()

    for window_label, since in (("All time", None), ("Last 30d", thirty_days_ago)):
        views             = select_paged(supa, "page_views", "user_email,company,role,program,topic,path,created_at", since, "created_at")
        sessions          = select_paged(supa, "sessions", "user_email,started_at", since, "started_at")
        packet_views      = select_paged(supa, "packet_views", "user_email,created_at,packets(role,yoe)", since, "created_at")
        assignment_views  = select_paged(supa, "assignment_views", "user_email,created_at,assignments(program,company,role,round)", since, "created_at")
        video_views       = select_paged(supa, "video_resource_views", "user_email,created_at,video_resources(topic,packets(role,yoe))", since, "created_at")
        feedback          = select_paged(supa, "feedback", "user_email,platform_rating,usefulness_rating,feedback_text,created_at", since, "created_at")

        write_subsheet(tsh, f"Daily Visits ({window_label})", build_daily_visits(sessions))
        write_subsheet(tsh, f"Usage Summary ({window_label})", build_usage_summary(views, sessions, packet_views))
        # Questions searches only (path "/"), like the app's Company & role breakdown;
        # Assignments searches also carry company+role and must not be mixed in.
        write_subsheet(tsh, f"Company & Role ({window_label})", build_company_role_breakdown([v for v in views if v.get("path") == "/"]))
        write_subsheet(tsh, f"Topic Searches ({window_label})", build_topic_breakdown(views))
        write_subsheet(tsh, f"Packet Reads ({window_label})", build_packet_reads(packet_views))
        write_subsheet(tsh, f"Assignment Opens ({window_label})", build_assignment_opens(assignment_views))
        write_subsheet(tsh, f"Videos Watched ({window_label})", build_video_watches(video_views))
        write_subsheet(tsh, f"Feedback ({window_label})", build_feedback_rows(feedback))
        # Trending roles (nav tab "Prepare for Trending roles", path /packets): who opened the page.
        write_subsheet(tsh, f"Trending Roles Visits ({window_label})", build_page_visits(views, "/packets"))

        # Daily tables: the same one-row-per-learner-per-IST-day exports the Tracking
        # page offers as CSV. Own try so they can never stop the tabs above.
        try:
            job_applies = select_paged(supa, "job_applies", "user_email,job_id,created_at", since, "created_at")
            company_packet_opens = select_paged(supa, "company_packet_opens", "user_email,slug,created_at", since, "created_at")
            write_subsheet(tsh, f"Daily Visitors Unique ({window_label})", build_daily_visitors(sessions))
            write_subsheet(tsh, f"Daily Searches ({window_label})", build_daily_searches(views))
            write_subsheet(tsh, f"Daily Content Engagement ({window_label})", build_daily_content_engagement(packet_views, video_views))
            write_subsheet(tsh, f"Open Hirings Visits ({window_label})", build_daily_page_visits(views, "/jobs"))
            write_subsheet(tsh, f"Open Hirings Apply Clicks ({window_label})", build_job_apply_clicks(job_applies))
            write_subsheet(tsh, f"Company Packets Visits ({window_label})", build_daily_page_visits(views, "/company-packets"))
            write_subsheet(tsh, f"Company Packets Opens ({window_label})", build_company_packet_opens(company_packet_opens))
        except Exception as e:
            print(f"tracking sheet: daily tabs ({window_label}) skipped: {e}", file=sys.stderr)

        # Resumes. Isolated in its own try so a missing/renamed table can never
        # stop the tabs above (or the other window) from being written.
        try:
            resume_events = select_paged(
                supa, "model_resume_event",
                "user_email,slug,kind,detail,at,model_resume(program,exp_label,background_label)", since, "at")
            write_subsheet(tsh, f"Resume Opens ({window_label})", build_resume_opens(resume_events))
            write_subsheet(tsh, f"Resume Clicks ({window_label})", build_resume_clicks(resume_events))
            write_subsheet(tsh, f"Resume Filters ({window_label})", build_resume_filters(resume_events))
            write_subsheet(tsh, f"Resume Downloads ({window_label})", build_resume_downloads(resume_events))
            write_subsheet(tsh, f"Resume Review Clicks ({window_label})", build_resume_review_clicks(resume_events))
        except Exception as e:
            print(f"tracking sheet: resume tabs ({window_label}) skipped: {e}", file=sys.stderr)

    packet_requests = select_packet_requests(supa)
    write_subsheet(tsh, "Packet Requests (Raised on Slack)", build_packet_requests_rows(packet_requests))

def classify_one_with_retry(client, classifier, row):
    """Same 429 backoff as backfill_topics.py's classify_with_retry — a
    normal night is usually a handful of rows, but a bulk sheet paste can
    push classify_new_topics past Gemini's per-minute rate limit, and
    without a retry a single 429 permanently strands that row's topic_ai at
    null (it falls back to displaying the sheet's raw topic tag on the
    public site — see effectiveTopic() in QuestionsView.tsx — until some
    later run happens to pick it back up)."""
    from google.genai import errors as genai_errors
    delay = 2
    for attempt in range(CLASSIFY_MAX_RETRIES):
        try:
            return classifier.classify_one(client, row["question"], row.get("related_topic")), None
        except genai_errors.ClientError as e:
            if getattr(e, "code", None) == 429 and attempt < CLASSIFY_MAX_RETRIES - 1:
                time.sleep(delay)
                delay *= 2
                continue
            return None, str(e)
        except Exception as e:
            return None, str(e)
    return None, "exhausted retries"


def classify_new_topics(supa):
    """AI-classifies up to CLASSIFY_CAP questions whose topic_ai is still
    null (new rows from this run, or anything missed previously) into the
    canonical taxonomy — see topics.py. One direct API call per row: fine
    for the handful of new questions a normal night adds. The large one-off
    backfill of everything already unclassified is backfill_topics.py's job
    (Batches API), not this — kept separate so a big backlog can never turn
    the nightly sync into an hours-long run.
    Skips cleanly if GEMINI_API_KEY isn't set."""
    if not GEMINI_API_KEY:
        print("GEMINI_API_KEY not set, skipping topic classification", file=sys.stderr)
        return
    from google import genai
    client = genai.Client(api_key=GEMINI_API_KEY)
    classifier = load_classifier(supa)

    res = (supa.table("questions").select("id,question,related_topic")
           .is_("topic_ai", "null").limit(CLASSIFY_CAP).execute())
    rows = res.data or []
    if not rows:
        print("topic classification: nothing new to classify")
        return

    classified, errors = 0, 0
    for r in rows:
        topic, err = classify_one_with_retry(client, classifier, r)
        if err is not None:
            errors += 1
            print(f"topic classification failed for question {r['id']}: {err}", file=sys.stderr)
            continue
        supa.table("questions").update({"topic_ai": topic}).eq("id", r["id"]).execute()
        classified += 1
    print(f"topic classification: classified {classified}, {errors} error(s), {len(rows)} row(s) considered")

# "Last synced" marker for the website's Questions cache. The page puts this
# value in its cache key (lib/sync-version.ts), so a new value = fresh questions
# on the first visit after the sync, instead of waiting for the 6 h cache timer.
QUESTIONS_SYNC_KEY = "questions_synced_at"

def questions_marker_row(now=None):
    now = now or datetime.now(timezone.utc)
    return {
        "key": QUESTIONS_SYNC_KEY,
        "value": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "updated_at": now.isoformat(),
    }

def mark_questions_synced(supa):
    """Never raises: a missing sync_meta table (supabase/add_sync_meta.sql not
    run yet) must not fail or block the sync itself."""
    try:
        supa.table("sync_meta").upsert(questions_marker_row(), on_conflict="key").execute()
        print(f"sync_meta: {QUESTIONS_SYNC_KEY} updated")
    except Exception as e:
        print(f"sync_meta: could not update {QUESTIONS_SYNC_KEY} "
              f"(has supabase/add_sync_meta.sql been run?): {e}", file=sys.stderr)

def main():
    # Read-write (not read-only): the tracking-insights export below writes
    # subsheets back to a spreadsheet. Everything else here only ever reads.
    creds = Credentials.from_service_account_info(
        CREDS, scopes=["https://www.googleapis.com/auth/spreadsheets"]
    )
    gc = gspread.authorize(creds)
    sh = gs_retry(gc.open_by_key, SHEET_ID)
    supa = create_client(SUPA_URL, SUPA_KEY)

    # --- Allowed learners (access gate) ---
    sync_allowed_learners(gc, supa)

    # --- Questions ---
    q_rows = []
    for tab_name, meta in QUESTION_TABS.items():
        try:
            ws = gs_retry(sh.worksheet, tab_name)
        except Exception as e:
            print(f"skip {tab_name}: {e}", file=sys.stderr); continue

        all_vals = gs_retry(ws.get_all_values)
        if not all_vals: continue
        headers = dedupe_headers(all_vals[0])
        for raw in all_vals[1:]:
            row = dict(zip(headers, raw + [""] * (len(headers) - len(raw))))
            company = get_col(row, "Company")
            role    = get_col(row, "Role")
            program = get_col(row, "Program")
            question= get_col(row, "Question (including Followups)")
            rnd     = get_col(row, meta["round_col"])
            topic   = get_col(row, "Related Topic")
            relevant= get_col(row, "Is Question Relevant").lower()
            if not (company and role and question): continue
            if relevant in ("false", "no", "0"): continue
            if len(question.split()) < 7: continue
            q_rows.append({
                "program": program or tab_name.split("|")[-1].strip(),
                "company": company,
                "role": role,
                "round": rnd,
                "question": question,
                "related_topic": topic,
                "fingerprint": fp(program, company, role, rnd, question),
            })
        print(f"{tab_name}: cumulative {len(q_rows)}")

    q_rows = dedupe_by_fp(q_rows)
    print(f"total unique questions: {len(q_rows)}")

    for i in range(0, len(q_rows), 500):
        supa.table("questions").upsert(q_rows[i:i+500], on_conflict="fingerprint").execute()
    if FULL_RESYNC:
        delete_stale(supa, "questions", {r["fingerprint"] for r in q_rows})

    try:
        classify_new_topics(supa)
    except Exception as e:
        print(f"topic classification error: {e}", file=sys.stderr)

    # Questions (upsert, optional hard-refresh delete, topic classification) are
    # all done: tell the website its cached copy is out of date.
    mark_questions_synced(supa)

    # --- Assignments ---
    try:
        ws = gs_retry(sh.worksheet, ASSIGNMENT_TAB)
        all_vals = gs_retry(ws.get_all_values)
        if all_vals:
            headers = dedupe_headers(all_vals[0])
            link_col_idx = None
            link_col_candidates = [i for i, h in enumerate(headers) if "assignment link" in h.lower()]
            if link_col_candidates:
                link_col_idx = link_col_candidates[0]
            chosen_header = headers[link_col_idx] if link_col_idx is not None else None
            print(
                f"assignment link column: candidates={[(i, headers[i]) for i in link_col_candidates]} "
                f"using index={link_col_idx} header={chosen_header!r}",
                file=sys.stderr,
            )

            n_data_rows = len(all_vals) - 1
            hyperlinks = fetch_column_hyperlinks(
                sh, ASSIGNMENT_TAB,
                (link_col_idx + 1) if link_col_idx is not None else None,
                n_data_rows,
            )

            candidates = []
            missing_logged = 0
            for row_i, raw in enumerate(all_vals[1:], start=2):
                row = dict(zip(headers, raw + [""] * (len(headers) - len(raw))))
                company = get_col(row, "Company")
                role    = get_col(row, "Role")
                program = get_col(row, "Program")
                rnd     = get_col(row, "# Round") or get_col(row, "Round")
                link_txt = norm(raw[link_col_idx]) if link_col_idx is not None and link_col_idx < len(raw) else ""
                api_link = hyperlinks[row_i - 2] if (row_i - 2) < len(hyperlinks) else None
                link = api_link
                if not link and link_txt.lower().startswith(("http://", "https://")):
                    link = link_txt
                if not (company and role): continue
                if not link and missing_logged < 15:
                    print(
                        f"assignment row {row_i} [{company} / {role}]: no link found "
                        f"(cell text={link_txt!r}, api hyperlink={api_link!r})",
                        file=sys.stderr,
                    )
                    missing_logged += 1
                candidates.append({"program": program, "company": company, "role": role, "round": rnd, "link": link})

            # Multiple candidates commonly get assigned the identical posting —
            # those collapse to one card. But if a (program, company, role,
            # round) group has more than one *distinct* link, that's actually
            # more than one real posting (e.g. different task variants across
            # hiring rounds), so each distinct link gets its own card instead
            # of silently keeping just the first-seen one.
            groups = {}
            for c in candidates:
                key = (c["program"], c["company"], c["role"], c["round"])
                groups.setdefault(key, []).append(c["link"])

            a_rows = []
            for (program, company, role, rnd), links in groups.items():
                distinct_links = []
                for l in links:
                    if l and l not in distinct_links:
                        distinct_links.append(l)
                if len(distinct_links) <= 1:
                    a_rows.append({
                        "program": program, "company": company, "role": role, "round": rnd,
                        "link": distinct_links[0] if distinct_links else None,
                        # link excluded from the fingerprint here: it's the
                        # single-link (common) case, so the identity stays
                        # stable even as link-extraction improves over time —
                        # upsert updates this same row in place.
                        "fingerprint": fp(program, company, role, rnd),
                        "added_by": None,
                    })
                else:
                    for link in distinct_links:
                        a_rows.append({
                            "program": program, "company": company, "role": role, "round": rnd,
                            "link": link,
                            # link included here: multiple distinct links for
                            # the same posting means each is a real, separate
                            # assignment, so each needs its own stable identity.
                            "fingerprint": fp(program, company, role, rnd, link),
                            "added_by": None,
                        })
            n_with_link = sum(1 for r in a_rows if r["link"])
            print(f"unique assignments: {len(a_rows)} ({n_with_link} with a link)")
            for i in range(0, len(a_rows), 500):
                supa.table("assignments").upsert(a_rows[i:i+500], on_conflict="fingerprint").execute()
            if FULL_RESYNC:
                delete_stale(supa, "assignments", {r["fingerprint"] for r in a_rows}, only_where_null="added_by")
    except Exception as e:
        print(f"assignments error: {e}", file=sys.stderr)

    # --- Tracking insights -> subsheets (Sheet <- Supabase, opposite direction) ---
    try:
        sync_tracking_to_sheet(gc, supa)
    except Exception as e:
        print(f"tracking sheet error: {e}", file=sys.stderr)

    print("done at", datetime.utcnow().isoformat())

if __name__ == "__main__":
    main()
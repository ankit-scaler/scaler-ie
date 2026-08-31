"""
Daily sync: Google Sheet <-> Supabase.
Reads 4 Question tabs + Assignments tab, dedupes, upserts by fingerprint.
Also writes tracking-insights snapshots (the same breakdowns Admin can
export as CSV) out to subsheets of a separate tracking spreadsheet.
"""
import os, json, hashlib, sys, re
from datetime import datetime, timedelta
import gspread
from google.oauth2.service_account import Credentials
from supabase import create_client

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
# Opt-in "hard refresh": also deletes questions/assignments rows whose
# fingerprint is no longer present in the sheet. Off by default — normal
# syncs only add/update, never delete, so an admin edit or a manual sheet
# row removal doesn't silently wipe data. Triggered from Admin -> Hard
# refresh, or the workflow_dispatch "full_resync" checkbox.
FULL_RESYNC = os.environ.get("FULL_RESYNC", "").strip().lower() == "true"

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
        ws = gc.open_by_key(LEARNERS_SHEET_ID).worksheet(LEARNERS_TAB)
        all_vals = ws.get_all_values()
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
    an explicit order so pagination across pages stays consistent."""
    PAGE = 1000
    out, frm = [], 0
    while True:
        q = supa.table(table).select(select_cols).order("id")
        if since_iso:
            q = q.gte(date_col, since_iso)
        res = q.range(frm, frm + PAGE - 1).execute()
        rows = res.data or []
        out.extend(rows)
        if len(rows) < PAGE:
            break
        frm += PAGE
    return out

def _fmt_ts(ts):
    return (ts or "")[:19].replace("T", " ")

# Each builder mirrors the equivalent grouping logic in AdminDashboard.tsx —
# same grain, same columns — so a subsheet and its CSV-export counterpart on
# the website never tell a different story.
def build_usage_summary(views, sessions, packet_views):
    m = {}
    def touch(email, ts):
        e = m.setdefault(email, {"views": 0, "minutes": 0.0, "packetsRead": 0, "last": ts})
        if ts > e["last"]: e["last"] = ts
        return e
    for v in views: touch(v["user_email"], v["created_at"])["views"] += 1
    for s in sessions: touch(s["user_email"], s["started_at"])["minutes"] += (s["duration_sec"] or 0) / 60
    for p in packet_views: touch(p["user_email"], p["created_at"])["packetsRead"] += 1
    rows = [["Email", "Views", "Minutes", "Packets Read", "Last Activity"]]
    for email in sorted(m):
        e = m[email]
        rows.append([email, e["views"], round(e["minutes"]), e["packetsRead"], _fmt_ts(e["last"])])
    return rows

def build_daily_visits(sessions):
    rows = [["Email", "Date", "Time", "Duration (min)", "Last Seen"]]
    for s in sorted(sessions, key=lambda r: r["started_at"], reverse=True):
        started = s["started_at"] or ""
        date, time = (started[:10], started[11:19]) if started else ("", "")
        minutes = round((s["duration_sec"] or 0) / 60)
        rows.append([s["user_email"], date, time, minutes, _fmt_ts(s.get("last_beat_at"))])
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
    rows = [["Program", "Company", "Role", "Email", "First time date", "Last time date", "Count"]]
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
    rows = [["Packet", "Email", "First read", "Last read", "Count"]]
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
    rows = [["Assignment", "Email", "First opened", "Last opened", "Count"]]
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
    rows = [["Video", "Email", "First watched", "Last watched", "Count"]]
    for (email, video), e in sorted(m.items(), key=lambda kv: kv[1]["last"], reverse=True):
        rows.append([video, email, _fmt_ts(e["first"]), _fmt_ts(e["last"]), e["count"]])
    return rows

def build_feedback_rows(feedback):
    rows = [["Email", "Platform Rating", "Usefulness Rating", "Feedback", "Submitted At"]]
    for f in sorted(feedback, key=lambda r: r["created_at"], reverse=True):
        rows.append([
            f["user_email"], f["platform_rating"], f["usefulness_rating"],
            f.get("feedback_text") or "", _fmt_ts(f["created_at"]),
        ])
    return rows

def write_subsheet(tsh, title, rows):
    try:
        ws = tsh.worksheet(title)
        ws.clear()
    except gspread.exceptions.WorksheetNotFound:
        cols = len(rows[0]) if rows else 8
        ws = tsh.add_worksheet(title=title, rows=max(len(rows) + 10, 100), cols=max(cols + 2, 8))
    if rows:
        ws.update(rows)
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
        tsh = gc.open_by_key(TRACKING_SHEET_ID)
    except Exception as e:
        print(f"tracking sheet: failed to open, skipping: {e}", file=sys.stderr)
        return

    thirty_days_ago = (datetime.utcnow() - timedelta(days=30)).isoformat()

    for window_label, since in (("All time", None), ("Last 30d", thirty_days_ago)):
        views             = select_paged(supa, "page_views", "user_email,company,role,program,created_at", since, "created_at")
        sessions          = select_paged(supa, "sessions", "user_email,duration_sec,started_at,last_beat_at", since, "started_at")
        packet_views      = select_paged(supa, "packet_views", "user_email,created_at,packets(role,yoe)", since, "created_at")
        assignment_views  = select_paged(supa, "assignment_views", "user_email,created_at,assignments(program,company,role,round)", since, "created_at")
        video_views       = select_paged(supa, "video_resource_views", "user_email,created_at,video_resources(topic,packets(role,yoe))", since, "created_at")
        feedback          = select_paged(supa, "feedback", "user_email,platform_rating,usefulness_rating,feedback_text,created_at", since, "created_at")

        write_subsheet(tsh, f"Daily Visits ({window_label})", build_daily_visits(sessions))
        write_subsheet(tsh, f"Usage Summary ({window_label})", build_usage_summary(views, sessions, packet_views))
        write_subsheet(tsh, f"Company & Role ({window_label})", build_company_role_breakdown(views))
        write_subsheet(tsh, f"Packet Reads ({window_label})", build_packet_reads(packet_views))
        write_subsheet(tsh, f"Assignment Opens ({window_label})", build_assignment_opens(assignment_views))
        write_subsheet(tsh, f"Videos Watched ({window_label})", build_video_watches(video_views))
        write_subsheet(tsh, f"Feedback ({window_label})", build_feedback_rows(feedback))

def main():
    # Read-write (not read-only): the tracking-insights export below writes
    # subsheets back to a spreadsheet. Everything else here only ever reads.
    creds = Credentials.from_service_account_info(
        CREDS, scopes=["https://www.googleapis.com/auth/spreadsheets"]
    )
    gc = gspread.authorize(creds)
    sh = gc.open_by_key(SHEET_ID)
    supa = create_client(SUPA_URL, SUPA_KEY)

    # --- Allowed learners (access gate) ---
    sync_allowed_learners(gc, supa)

    # --- Questions ---
    q_rows = []
    for tab_name, meta in QUESTION_TABS.items():
        try:
            ws = sh.worksheet(tab_name)
        except Exception as e:
            print(f"skip {tab_name}: {e}", file=sys.stderr); continue

        all_vals = ws.get_all_values()
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

    # --- Assignments ---
    try:
        ws = sh.worksheet(ASSIGNMENT_TAB)
        all_vals = ws.get_all_values()
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
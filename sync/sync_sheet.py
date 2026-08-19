"""
Daily sync: Google Sheet -> Supabase.
Reads 4 Question tabs + Assignments tab, dedupes, upserts by fingerprint.
"""
import os, json, hashlib, sys, re
from datetime import datetime
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

    existing = supa.table("allowed_learners").select("email").is_("added_by", "null").execute()
    stale = [r["email"] for r in existing.data if r["email"] not in emails]
    for i in range(0, len(stale), 200):
        supa.table("allowed_learners").delete().in_("email", stale[i:i+200]).execute()
    print(f"learner allow-list: synced {len(emails)} emails, removed {len(stale)} stale")

def main():
    creds = Credentials.from_service_account_info(
        CREDS, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"]
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
            if len(question.split()) < 5: continue
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

            a_rows = []
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
                a_rows.append({
                    "program": program,
                    "company": company,
                    "role": role,
                    "round": rnd,
                    "link": link,
                    # link is deliberately excluded: it's a mutable field on an
                    # otherwise-stable (program, company, role, round) identity.
                    # Including it here means every time link-extraction improves,
                    # the fingerprint changes and upsert creates a duplicate row
                    # instead of updating the existing one in place.
                    "fingerprint": fp(program, company, role, rnd),
                })
            a_rows = dedupe_by_fp(a_rows)
            n_with_link = sum(1 for r in a_rows if r["link"])
            print(f"unique assignments: {len(a_rows)} ({n_with_link} with a link)")
            for i in range(0, len(a_rows), 500):
                supa.table("assignments").upsert(a_rows[i:i+500], on_conflict="fingerprint").execute()
    except Exception as e:
        print(f"assignments error: {e}", file=sys.stderr)

    print("done at", datetime.utcnow().isoformat())

if __name__ == "__main__":
    main()
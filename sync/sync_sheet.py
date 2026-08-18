"""
Daily sync: Google Sheet -> Supabase.
Reads 4 Question tabs + Assignments tab, upserts by fingerprint.
Env: GOOGLE_CREDS_JSON, SHEET_ID, SUPABASE_URL, SUPABASE_SERVICE_KEY
"""
import os, json, hashlib, sys
from datetime import datetime
import gspread
from google.oauth2.service_account import Credentials
from supabase import create_client

SHEET_ID = os.environ["SHEET_ID"]
SUPA_URL = os.environ["SUPABASE_URL"]
SUPA_KEY = os.environ["SUPABASE_SERVICE_KEY"]
CREDS    = json.loads(os.environ["GOOGLE_CREDS_JSON"])

QUESTION_TABS = {
    "Questions | Academy": {"round_col": "Round"},
    "Questions | DevOps":  {"round_col": "# Round - Name"},
    "Questions | AIML":    {"round_col": "Round"},
    "Questions | DSML":    {"round_col": "# Round - Name"},
}
ASSIGNMENT_TAB = "Assignments"

def norm(s):
    return (s or "").strip()

def fp(*parts):
    return hashlib.sha256("||".join(str(p or "") for p in parts).encode()).hexdigest()

def get_col(row, headers, name):
    # Tolerate leading spaces in header names
    for h in headers:
        if h and h.strip() == name.strip():
            return norm(row.get(h, ""))
    return ""

def get_hyperlink(ws, cell_a1):
    """Try to pull a hyperlink from a cell via Sheets API embed."""
    try:
        res = ws.spreadsheet.values_get(
            f"'{ws.title}'!{cell_a1}",
            params={"valueRenderOption": "FORMULA"}
        )
        v = res.get("values", [[""]])[0][0]
        if isinstance(v, str) and v.startswith("=HYPERLINK("):
            # =HYPERLINK("url","label")
            inside = v[len("=HYPERLINK("):-1]
            url = inside.split(",")[0].strip().strip('"')
            return url
    except Exception:
        pass
    return None

def main():
    creds = Credentials.from_service_account_info(
        CREDS, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"]
    )
    gc = gspread.authorize(creds)
    sh = gc.open_by_key(SHEET_ID)
    supa = create_client(SUPA_URL, SUPA_KEY)

    # --- Questions ---
    q_rows = []
    for tab_name, meta in QUESTION_TABS.items():
        try:
            ws = sh.worksheet(tab_name)
        except Exception as e:
            print(f"skip {tab_name}: {e}", file=sys.stderr); continue
        records = ws.get_all_records(head=1)
        headers = ws.row_values(1)
        for r in records:
            company = get_col(r, headers, "Company")
            role    = get_col(r, headers, "Role")
            program = get_col(r, headers, "Program")
            question= get_col(r, headers, "Question (including Followups)")
            rnd     = get_col(r, headers, meta["round_col"])
            topic   = get_col(r, headers, "Related Topic")
            relevant= str(r.get("Is Question Relevant", "")).strip().lower()
            if not (company and role and question): continue
            if relevant in ("false","no","0"): continue
            q_rows.append({
                "program": program or tab_name.split("|")[-1].strip(),
                "company": company,
                "role": role,
                "round": rnd,
                "question": question,
                "related_topic": topic,
                "fingerprint": fp(program, company, role, rnd, question),
            })
    print(f"questions: {len(q_rows)}")

    # Upsert in chunks
    for i in range(0, len(q_rows), 500):
        supa.table("questions").upsert(q_rows[i:i+500], on_conflict="fingerprint").execute()

    # --- Assignments ---
    try:
        ws = sh.worksheet(ASSIGNMENT_TAB)
        headers = ws.row_values(1)
        all_vals = ws.get_all_values()
        link_col_idx = None
        for i, h in enumerate(headers):
            if h and "Assignment Link" in h:
                link_col_idx = i; break

        a_rows = []
        for row_i, row in enumerate(all_vals[1:], start=2):
            def cell(name):
                for i, h in enumerate(headers):
                    if h and h.strip() == name.strip() and i < len(row):
                        return norm(row[i])
                return ""
            company = cell("Company")
            role    = cell("Role")
            program = cell("Program")
            rnd     = cell("# Round") or cell("Round")
            link_txt = row[link_col_idx] if link_col_idx is not None and link_col_idx < len(row) else ""
            # Prefer hyperlink over text
            link = None
            if link_col_idx is not None:
                a1 = gspread.utils.rowcol_to_a1(row_i, link_col_idx + 1)
                link = get_hyperlink(ws, a1) or link_txt
            if not (company and role): continue
            a_rows.append({
                "program": program,
                "company": company,
                "role": role,
                "round": rnd,
                "link": link,
                "fingerprint": fp(program, company, role, rnd, link),
            })
        print(f"assignments: {len(a_rows)}")
        for i in range(0, len(a_rows), 500):
            supa.table("assignments").upsert(a_rows[i:i+500], on_conflict="fingerprint").execute()
    except Exception as e:
        print(f"assignments error: {e}", file=sys.stderr)

    print("done at", datetime.utcnow().isoformat())

if __name__ == "__main__":
    main()

"""
Daily sync: Google Sheet -> Supabase.
Reads 4 Question tabs + Assignments tab, dedupes, upserts by fingerprint.
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

def get_hyperlink(ws, cell_a1):
    try:
        res = ws.spreadsheet.values_get(
            f"'{ws.title}'!{cell_a1}",
            params={"valueRenderOption": "FORMULA"}
        )
        v = res.get("values", [[""]])[0][0]
        if isinstance(v, str) and v.startswith("=HYPERLINK("):
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
            for i, h in enumerate(headers):
                if "assignment link" in h.lower():
                    link_col_idx = i; break

            a_rows = []
            for row_i, raw in enumerate(all_vals[1:], start=2):
                row = dict(zip(headers, raw + [""] * (len(headers) - len(raw))))
                company = get_col(row, "Company")
                role    = get_col(row, "Role")
                program = get_col(row, "Program")
                rnd     = get_col(row, "# Round") or get_col(row, "Round")
                link_txt = raw[link_col_idx] if link_col_idx is not None and link_col_idx < len(raw) else ""
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
            a_rows = dedupe_by_fp(a_rows)
            print(f"unique assignments: {len(a_rows)}")
            for i in range(0, len(a_rows), 500):
                supa.table("assignments").upsert(a_rows[i:i+500], on_conflict="fingerprint").execute()
    except Exception as e:
        print(f"assignments error: {e}", file=sys.stderr)

    print("done at", datetime.utcnow().isoformat())

if __name__ == "__main__":
    main()
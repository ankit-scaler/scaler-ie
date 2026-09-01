"""
Full reclassification of every question's AI topic, via direct (non-batch)
Gemini calls run concurrently.

Deliberately does NOT use the Gemini Batch API — that requires a billing
tier this project's key doesn't have (confirmed via a real 400
FAILED_PRECONDITION from client.batches.create() in production). Direct
generate_content calls work fine on the same key (that's what the nightly
sync's classify_new_topics already uses for new rows); this script just
runs a lot of them concurrently to make reclassifying the whole table
practical in one job.

Reclassifies EVERY row except ones an admin has hand-corrected
(topic_ai_manual = true, set by the "Fix a question's topic" editor in
Admin), not just topic_ai IS NULL ones. This is intentional: the original
bulk backfill trusted the sheet's raw topic tag for rows it could bucket
by keyword alone, and that tag is sometimes flatly wrong (e.g. a
JavaScript question tagged "Java" because that's the course module it
came from). Re-running this is the fix — it always reads the actual
question text (see topics.py's system prompt) — so it's safe and useful
to run again any time classification quality looks off, not just to catch
new rows.

Safe to re-run any time: each non-manual row's topic_ai is simply
overwritten with a fresh classification of the current question text.

Run manually — locally with real env vars, or via the "Backfill AI Topics"
GitHub Actions workflow (workflow_dispatch, no schedule).

Usage: python sync/backfill_topics.py
Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY
"""
import os, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from google import genai
from google.genai import errors as genai_errors
from supabase import create_client
from topics import load_classifier

SUPA_URL = os.environ["SUPABASE_URL"]
SUPA_KEY = os.environ["SUPABASE_SERVICE_KEY"]
GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]

PAGE = 1000
# Direct calls have per-minute rate limits (unlike the batch path), so this
# stays modest rather than maxing out threads — a 429 costs more time
# (retry + backoff) than a slightly lower concurrency would.
WORKERS = 8
MAX_RETRIES = 5
PROGRESS_EVERY = 200


def select_all(supa):
    out, frm = [], 0
    while True:
        res = (supa.table("questions").select("id,question,related_topic")
               .eq("topic_ai_manual", False).order("id")
               .range(frm, frm + PAGE - 1).execute())
        rows = res.data or []
        out.extend(rows)
        if len(rows) < PAGE:
            break
        frm += PAGE
    return out


def classify_with_retry(client, classifier, row):
    delay = 2
    for attempt in range(MAX_RETRIES):
        try:
            topic = classifier.classify_one(client, row["question"], row.get("related_topic"))
            return row["id"], topic, None
        except genai_errors.ClientError as e:
            # 429s are the only case worth backing off and retrying —
            # anything else (bad request, auth) will just fail again.
            if getattr(e, "code", None) == 429 and attempt < MAX_RETRIES - 1:
                time.sleep(delay)
                delay *= 2
                continue
            return row["id"], None, str(e)
        except Exception as e:
            return row["id"], None, str(e)
    return row["id"], None, "exhausted retries"


def main():
    supa = create_client(SUPA_URL, SUPA_KEY)
    client = genai.Client(api_key=GEMINI_API_KEY)
    classifier = load_classifier(supa)

    rows = select_all(supa)
    print(f"{len(rows)} question(s) to (re)classify")
    if not rows:
        return

    classified, errors, done = 0, 0, 0
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = [pool.submit(classify_with_retry, client, classifier, r) for r in rows]
        for fut in as_completed(futures):
            qid, topic, err = fut.result()
            done += 1
            if err is not None:
                errors += 1
                print(f"  question {qid}: {err}", file=sys.stderr)
            else:
                supa.table("questions").update({"topic_ai": topic}).eq("id", qid).execute()
                classified += 1
            if done % PROGRESS_EVERY == 0:
                print(f"  {done}/{len(rows)} processed ({classified} classified, {errors} errors)")

    print(f"done: classified {classified}, {errors} error(s), at "
          f"{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}")


if __name__ == "__main__":
    main()

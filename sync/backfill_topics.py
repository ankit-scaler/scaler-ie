"""
One-off (or "run it again to catch up") bulk classification of every
question whose topic_ai is still null, via the Gemini Batch API — 50%
cheaper than direct calls and built for exactly this shape of job
(thousands of independent short requests), unlike sync_sheet.py's nightly
incremental classifier which intentionally only handles a small capped
number of new rows per run so the daily job stays fast.

Uses Gemini's *inline* batch requests, not the file/JSONL mode: the file
mode supports a per-request "key" for reliable result mapping, but this
project standardized on generate_content's plain request shape (see
topics.py's docstring for why), and the inline path is what's confirmed to
combine cleanly with structured output. Inline batch results come back
positionally (no key), so this script keeps its own parallel list of
question ids in submission order and zips them back up by index.

Safe to re-run any time: it only ever selects rows where topic_ai IS NULL,
so it naturally catches anything the nightly cap left behind, or a row
that errored last time.

Run manually — locally with real env vars, or via the "Backfill AI Topics"
GitHub Actions workflow (workflow_dispatch, no schedule).

Usage: python sync/backfill_topics.py
Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY
"""
import os, sys, time
from google import genai
from supabase import create_client
from topics import build_batch_request, CLASSIFY_MODEL, _parse_topic

SUPA_URL = os.environ["SUPABASE_URL"]
SUPA_KEY = os.environ["SUPABASE_SERVICE_KEY"]
GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]

PAGE = 1000
# Inline batch requests are capped at 20MB total, not by request count —
# each request here is small (short question + the fixed topic-list system
# prompt), but this stays well clear of that ceiling regardless of how long
# individual questions get.
BATCH_CHUNK = 2000
POLL_SECS = 30
COMPLETED_STATES = {
    "JOB_STATE_SUCCEEDED", "JOB_STATE_PARTIALLY_SUCCEEDED",
    "JOB_STATE_FAILED", "JOB_STATE_CANCELLED", "JOB_STATE_EXPIRED",
}
# Both of these still populate dest.inlined_responses per-item (success and
# error entries side by side) — only the fully-failed/cancelled/expired
# states below mean there's nothing usable to read back.
READABLE_STATES = {"JOB_STATE_SUCCEEDED", "JOB_STATE_PARTIALLY_SUCCEEDED"}

def select_unclassified(supa):
    out, frm = [], 0
    while True:
        res = (supa.table("questions").select("id,question,related_topic")
               .is_("topic_ai", "null").order("id")
               .range(frm, frm + PAGE - 1).execute())
        rows = res.data or []
        out.extend(rows)
        if len(rows) < PAGE:
            break
        frm += PAGE
    return out

def run_batch(client, supa, rows):
    ids = [r["id"] for r in rows]
    requests = [build_batch_request(r["question"], r.get("related_topic")) for r in rows]

    batch_job = client.batches.create(
        model=CLASSIFY_MODEL,
        src=requests,
        config={"display_name": "topic-classification-backfill"},
    )
    print(f"submitted batch {batch_job.name} ({len(requests)} requests)")

    while batch_job.state.name not in COMPLETED_STATES:
        print(f"  {batch_job.state.name}")
        time.sleep(POLL_SECS)
        batch_job = client.batches.get(name=batch_job.name)

    if batch_job.state.name not in READABLE_STATES:
        print(f"batch {batch_job.name} ended in state {batch_job.state.name}, skipping", file=sys.stderr)
        return
    if batch_job.state.name == "JOB_STATE_PARTIALLY_SUCCEEDED":
        print(f"batch {batch_job.name}: partially succeeded — classifying what did, "
              f"the rest stay null and get retried on the next run", file=sys.stderr)

    responses = batch_job.dest.inlined_responses
    if len(responses) != len(ids):
        print(f"batch {batch_job.name}: expected {len(ids)} responses, got {len(responses)} — "
              f"positional mapping may be off, aborting this chunk", file=sys.stderr)
        return

    classified, errors = 0, 0
    for qid, item in zip(ids, responses):
        if item.response:
            topic = _parse_topic(item.response.text)
            supa.table("questions").update({"topic_ai": topic}).eq("id", qid).execute()
            classified += 1
        else:
            errors += 1
            print(f"  question {qid}: {item.error}", file=sys.stderr)
    print(f"batch {batch_job.name}: classified {classified}, {errors} error(s)")

def main():
    supa = create_client(SUPA_URL, SUPA_KEY)
    client = genai.Client(api_key=GEMINI_API_KEY)

    rows = select_unclassified(supa)
    print(f"{len(rows)} question(s) need classification")
    if not rows:
        return

    for i in range(0, len(rows), BATCH_CHUNK):
        run_batch(client, supa, rows[i:i + BATCH_CHUNK])

    print("done at", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))

if __name__ == "__main__":
    main()

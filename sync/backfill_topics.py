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

Two options narrow a run:
  --only-topic NAME  only re-check questions currently tagged NAME. For a
                     Behavioral topic this is the targeted fix for technical
                     questions filed as Behavioral: it only touches the ones
                     that read as technical (topics.looks_technical) and gives
                     them the same second look the nightly sync now does —
                     genuinely behavioural questions aren't re-asked at all.
  --dry-run          classify and print what would change (question id, old
                     topic -> new topic), but write nothing.

Usage: python sync/backfill_topics.py [--only-topic Behavioral] [--dry-run]
Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY
"""
import argparse, os, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from google import genai
from google.genai import errors as genai_errors
from supabase import create_client
from topics import load_classifier, looks_technical, is_behavioral_topic

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


def select_all(supa, only_topic=None):
    out, frm = [], 0
    while True:
        q = (supa.table("questions").select("id,question,related_topic,topic_ai")
             .eq("topic_ai_manual", False))
        if only_topic:
            q = q.eq("topic_ai", only_topic)
        res = q.order("id").range(frm, frm + PAGE - 1).execute()
        rows = res.data or []
        out.extend(rows)
        if len(rows) < PAGE:
            break
        frm += PAGE
    return out


def classify_with_retry(client, classifier, row, recheck_only=False):
    delay = 2
    for attempt in range(MAX_RETRIES):
        try:
            if recheck_only:
                topic = classifier.recheck_behavioral(client, row["question"], row.get("related_topic"))
            else:
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
    parser = argparse.ArgumentParser()
    parser.add_argument("--only-topic", default="", help="only re-check questions currently tagged this topic")
    parser.add_argument("--dry-run", action="store_true", help="print what would change; write nothing")
    args = parser.parse_args()

    supa = create_client(SUPA_URL, SUPA_KEY)
    client = genai.Client(api_key=GEMINI_API_KEY)
    classifier = load_classifier(supa)

    rows = select_all(supa, args.only_topic or None)
    recheck_only = bool(args.only_topic) and is_behavioral_topic(args.only_topic)
    if recheck_only:
        tagged = len(rows)
        rows = [r for r in rows if looks_technical(r["question"])]
        print(f"{tagged} question(s) tagged {args.only_topic}; {len(rows)} read as technical and get a second look")
    else:
        print(f"{len(rows)} question(s) to (re)classify" + (f" (tagged {args.only_topic})" if args.only_topic else ""))
    if args.dry_run:
        print("DRY RUN: nothing will be written")
    if not rows:
        return

    classified, changed, errors, done = 0, 0, 0, 0
    old_topic = {r["id"]: r.get("topic_ai") for r in rows}
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = [pool.submit(classify_with_retry, client, classifier, r, recheck_only) for r in rows]
        for fut in as_completed(futures):
            qid, topic, err = fut.result()
            done += 1
            if err is not None:
                errors += 1
                print(f"  question {qid}: {err}", file=sys.stderr)
            else:
                classified += 1
                if topic != old_topic.get(qid):
                    changed += 1
                    print(f"  question {qid}: {old_topic.get(qid)} -> {topic}")
                if not args.dry_run:
                    supa.table("questions").update({"topic_ai": topic}).eq("id", qid).execute()
            if done % PROGRESS_EVERY == 0:
                print(f"  {done}/{len(rows)} processed ({classified} classified, {errors} errors)")

    verb = "would change" if args.dry_run else "changed"
    print(f"done: classified {classified}, {verb} {changed}, {errors} error(s), at "
          f"{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}")
    if not args.dry_run and changed:
        # The Questions page caches its data until the next sync stamp (see
        # lib/cached-table.ts, if merged); stamp it so the fixes show up now.
        try:
            from datetime import datetime, timezone
            supa.table("cache_versions").upsert(
                {"name": "questions", "updated_at": datetime.now(timezone.utc).isoformat()}, on_conflict="name"
            ).execute()
        except Exception as e:
            print(f"cache_versions bump skipped: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()

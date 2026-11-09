"""
Daily Slack digest: unique visitors for the last 3 IST days (today so far +
the 2 previous full days) plus today's feedback. Runs standalone at 6 PM IST
(.github/workflows/daily-digest.yml) — separate from sync_sheet.py so it
doesn't need the Google Sheets credentials.

Every day is bucketed in IST by each row's own timestamp, never by when this
job happens to run, so a delayed run can't shift counts to the wrong date.
Same source and exclusions as the Admin Tracking chart ("Daily Visits"):
sessions.started_at, unique user_email, internal @scaler.com excluded.
"""
import os, sys
from datetime import datetime, timedelta, timezone
import requests
from supabase import create_client

# IST is a fixed +05:30 (no DST); same anchor as app/api/admin/stats/route.ts.
IST = timezone(timedelta(hours=5, minutes=30))
INTERNAL_EMAIL_PATTERN = "%@scaler.com"
DAYS = 3


def parse_ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def window_utc(today_ist, days):
    """[start, end) covering `days` IST days ending with today_ist (a date)."""
    start = datetime(today_ist.year, today_ist.month, today_ist.day, tzinfo=IST) - timedelta(days=days - 1)
    end = datetime(today_ist.year, today_ist.month, today_ist.day, tzinfo=IST) + timedelta(days=1)
    return start.astimezone(timezone.utc).isoformat(), end.astimezone(timezone.utc).isoformat()


def build_counts(sessions, today_ist, days=DAYS):
    """[(date, unique_visitors)] oldest -> newest, bucketed by IST date."""
    buckets = {today_ist - timedelta(days=i): set() for i in range(days)}
    for s in sessions:
        d = parse_ts(s["started_at"]).astimezone(IST).date()
        if d in buckets:
            buckets[d].add(s["user_email"])
    return [(d, len(buckets[d])) for d in sorted(buckets)]


def select_window(supa, table, cols, since_iso, until_iso, date_col):
    PAGE, out, frm = 1000, [], 0
    while True:
        res = (supa.table(table).select(cols).order("id")
               .not_.ilike("user_email", INTERNAL_EMAIL_PATTERN)
               .gte(date_col, since_iso).lt(date_col, until_iso)
               .range(frm, frm + PAGE - 1).execute())
        rows = res.data or []
        out.extend(rows)
        if len(rows) < PAGE:
            return out
        frm += PAGE


def build_message(counts, feedback, now_ist):
    today = now_ist.date()
    lines = [f"*Daily Update — {now_ist.strftime('%Y-%m-%d %I:%M %p')} IST*"]
    for d, n in counts:
        suffix = " (so far)" if d == today else ""
        lines.append(f"• {d.isoformat()}{suffix}: {n} unique visitors")
    if feedback:
        lines.append(f"*Feedback received today ({len(feedback)}):*")
        for f in sorted(feedback, key=lambda r: r["created_at"]):
            text = f.get("feedback_text") or "—"
            lines.append(f"• {f['user_email']} — platform {f['platform_rating']}/5, usefulness {f['usefulness_rating']}/5: {text}")
    else:
        lines.append("_No feedback submitted today._")
    return "\n".join(lines)


def main():
    webhook = os.environ.get("SLACK_DAILY_DIGEST_WEBHOOK_URL")
    if not webhook:
        print("SLACK_DAILY_DIGEST_WEBHOOK_URL not set, skipping daily digest", file=sys.stderr)
        return
    supa = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    now_ist = datetime.now(IST)
    today = now_ist.date()

    since, until = window_utc(today, DAYS)
    sessions = select_window(supa, "sessions", "user_email,started_at", since, until, "started_at")
    t_since, t_until = window_utc(today, 1)
    feedback = select_window(
        supa, "feedback",
        "user_email,platform_rating,usefulness_rating,feedback_text,created_at",
        t_since, t_until, "created_at",
    )

    text = build_message(build_counts(sessions, today), feedback, now_ist)
    res = requests.post(webhook, json={"text": text}, timeout=10)
    if not res.ok:
        print(f"daily digest: Slack post failed [{res.status_code}]: {res.text}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

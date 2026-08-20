import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";

const REPO = "ankit-scaler/scaler-ie";
const WORKFLOW = "daily-sync.yml";

// Triggers the same GitHub Actions sync job as the "Run workflow" button in
// GitHub, but with full_resync=true — so it also deletes questions/
// assignments no longer present in the sheet (admin-added assignments are
// protected via added_by; see sync/sync_sheet.py). Requires a GH_ACTIONS_TOKEN
// repo secret since the site itself has no Google Sheets credentials — only
// the Actions job does.
export async function POST() {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ ok: false }, { status: 403 });

  const token = process.env.GH_ACTIONS_TOKEN;
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "GH_ACTIONS_TOKEN isn't configured on the server." },
      { status: 500 }
    );
  }

  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "content-type": "application/json",
    },
    body: JSON.stringify({ ref: "main", inputs: { full_resync: "true" } }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      { ok: false, error: `GitHub API error (${res.status}): ${text.slice(0, 300)}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}

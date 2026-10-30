import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";

const REPO = "ankit-scaler/scaler-ie";
const WORKFLOW = "daily-jobs-sync.yml";

// Triggers the same GitHub Actions jobs-sync job as the "Run workflow"
// button in GitHub. Requires a GH_ACTIONS_TOKEN repo secret — same one
// hard-refresh/route.ts already uses — since the site itself never runs
// JobSpy directly, only the Actions job does.
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
    body: JSON.stringify({ ref: "main" }),
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

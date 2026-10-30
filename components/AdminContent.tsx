"use client";
import { useState } from "react";
import PacketLinksManager from "./PacketLinksManager";
import AssignmentsManager from "./AssignmentsManager";
import VideoResourcesManager from "./VideoResourcesManager";
import QuestionTopicsManager from "./QuestionTopicsManager";
import TopicsManager from "./TopicsManager";

export default function AdminContent() {
  const [hardRefreshing, setHardRefreshing] = useState(false);
  const [hardRefreshMsg, setHardRefreshMsg] = useState<string | null>(null);
  const [jobsRefreshing, setJobsRefreshing] = useState(false);
  const [jobsRefreshMsg, setJobsRefreshMsg] = useState<string | null>(null);

  const hardRefresh = async () => {
    if (!confirm(
      "Hard refresh from Sheets: re-syncs questions and assignments, and deletes any that " +
      "are no longer in the sheet (assignments added manually here in Admin are never deleted). " +
      "Runs in GitHub Actions and takes about 2 minutes. Continue?"
    )) return;
    setHardRefreshing(true);
    setHardRefreshMsg(null);
    const res = await fetch("/api/admin/hard-refresh", { method: "POST" });
    const j = await res.json().catch(() => ({ ok: false }));
    setHardRefreshing(false);
    setHardRefreshMsg(j.ok
      ? "Triggered — check the Actions tab on GitHub for progress, then reload this page in ~2 minutes."
      : (j.error || "Couldn't trigger the refresh."));
  };

  const refreshJobs = async () => {
    if (!confirm(
      "Refresh Jobs: re-scrapes LinkedIn/Naukri/Indeed for the configured roles and locations, and " +
      "upserts into the jobs table (existing postings are deduped, not duplicated). Runs in GitHub " +
      "Actions and can take several minutes. Continue?"
    )) return;
    setJobsRefreshing(true);
    setJobsRefreshMsg(null);
    const res = await fetch("/api/admin/refresh-jobs", { method: "POST" });
    const j = await res.json().catch(() => ({ ok: false }));
    setJobsRefreshing(false);
    setJobsRefreshMsg(j.ok
      ? "Triggered — check the Actions tab on GitHub for progress; this can take several minutes."
      : (j.error || "Couldn't trigger the refresh."));
  };

  return (
    <div className="space-y-10">
      <section>
        <span className="font-mono text-[11px] uppercase tracking-widest text-mute">Admin</span>
        <h1 className="mt-1 font-display text-4xl leading-tight">Content management</h1>
      </section>

      <PacketLinksManager />

      <VideoResourcesManager />

      <AssignmentsManager />

      <TopicsManager />

      <QuestionTopicsManager />

      <div className="relative overflow-hidden rounded-2xl border border-edge bg-panel p-5 shadow-card">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-devops" />
        <div className="mb-1 font-mono text-xs font-bold uppercase tracking-widest text-devops">Hard refresh from Sheets</div>
        <p className="mb-4 text-sm text-mute">
          Use after a sanity edit in the sheet. Re-syncs questions and assignments immediately, and
          removes any that are no longer in the sheet — admin-added assignments are never touched.
          Runs as a GitHub Actions job and takes about 2 minutes.
        </p>
        <button
          onClick={hardRefresh}
          disabled={hardRefreshing}
          className="rounded-xl border border-devops/40 bg-devops/10 px-4 py-2 text-sm font-medium text-devops transition hover:bg-devops/20 disabled:opacity-50"
        >{hardRefreshing ? "Triggering…" : "Hard refresh from Sheets"}</button>
        {hardRefreshMsg && (
          <div className="mt-3 rounded-xl border border-edge/60 bg-panel2 px-3 py-2 text-sm text-mute">{hardRefreshMsg}</div>
        )}
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-edge bg-panel p-5 shadow-card">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-acad" />
        <div className="mb-1 font-mono text-xs font-bold uppercase tracking-widest text-acad">Refresh Jobs</div>
        <p className="mb-4 text-sm text-mute">
          Re-scrapes LinkedIn/Naukri/Indeed immediately instead of waiting for the daily cron.
          Existing postings are deduped, not duplicated. Runs as a GitHub Actions job and can take
          several minutes.
        </p>
        <button
          onClick={refreshJobs}
          disabled={jobsRefreshing}
          className="rounded-xl border border-acad/40 bg-acad/10 px-4 py-2 text-sm font-medium text-acad transition hover:bg-acad/20 disabled:opacity-50"
        >{jobsRefreshing ? "Triggering…" : "Refresh Jobs"}</button>
        {jobsRefreshMsg && (
          <div className="mt-3 rounded-xl border border-edge/60 bg-panel2 px-3 py-2 text-sm text-mute">{jobsRefreshMsg}</div>
        )}
      </div>
    </div>
  );
}

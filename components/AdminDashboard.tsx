"use client";
import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from "recharts";
import { FlightSpinner } from "./FlightLoader";
import PacketLinksManager from "./PacketLinksManager";
import AssignmentsManager from "./AssignmentsManager";
import LearnerAccessManager from "./LearnerAccessManager";
import VideoResourcesManager from "./VideoResourcesManager";
import QuestionTopicsManager from "./QuestionTopicsManager";
import TopicsManager from "./TopicsManager";

type Stats = {
  views: { user_email: string; company: string | null; role: string | null; program: string | null; topic: string | null; created_at: string }[];
  sessions: { user_email: string; duration_sec: number; started_at: string }[];
  admins: { email: string; added_at: string; added_by: string | null }[];
  packetViews: { user_email: string; created_at: string; role: string | null; yoe: string | null }[];
  assignmentViews: { user_email: string; created_at: string; program: string | null; company: string | null; role: string | null; round: string | null }[];
  videoViews: { user_email: string; created_at: string; topic: string | null; role: string | null; yoe: string | null }[];
  feedback: { user_email: string; platform_rating: number; usefulness_rating: number; feedback_text: string | null; created_at: string }[];
};

const RANGES = [
  { k: "day",   label: "24h" },
  { k: "week",  label: "7d"  },
  { k: "15d",   label: "15d" },
  { k: "month", label: "30d" },
];

const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgoStr = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);

function formatDuration(totalMinutes: number) {
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const days  = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const mins  = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map(r => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Pure builders so the same grouping logic can run both against the live
// on-screen `data` (via useMemo below) and against a one-off fetch scoped to
// whatever date window an "Export CSV" button asks for — the two paths must
// never drift apart.
function buildCompanyRoleBreakdown(views: Stats["views"]) {
  const m = new Map<string, { email: string; program: string; company: string; role: string; views: number; first: string; last: string }>();
  views.forEach(v => {
    if (!v.company || !v.role) return;
    const company = v.company.trim(), role = v.role.trim(), program = v.program?.trim() || "—";
    const k = `${v.user_email}|${program}|${company}|${role}`;
    const e = m.get(k) || { email: v.user_email, program, company, role, views: 0, first: v.created_at, last: v.created_at };
    e.views++;
    if (v.created_at < e.first) e.first = v.created_at;
    if (v.created_at > e.last) e.last = v.created_at;
    m.set(k, e);
  });
  return Array.from(m.values()).sort((a, b) => b.last.localeCompare(a.last));
}
function buildTopicBreakdown(views: Stats["views"]) {
  const m = new Map<string, { email: string; topic: string; count: number; first: string; last: string }>();
  views.forEach(v => {
    if (!v.topic) return;
    const topic = v.topic.trim();
    const k = `${v.user_email}|${topic}`;
    const e = m.get(k) || { email: v.user_email, topic, count: 0, first: v.created_at, last: v.created_at };
    e.count++;
    if (v.created_at < e.first) e.first = v.created_at;
    if (v.created_at > e.last) e.last = v.created_at;
    m.set(k, e);
  });
  return Array.from(m.values()).sort((a, b) => b.last.localeCompare(a.last));
}
function buildPacketByEmail(packetViews: Stats["packetViews"]) {
  const m = new Map<string, { email: string; packet: string; count: number; first: string; last: string }>();
  packetViews.forEach(v => {
    const packet = `${v.role || "—"} · ${v.yoe || "—"}`;
    const k = `${v.user_email}|${packet}`;
    const e = m.get(k) || { email: v.user_email, packet, count: 0, first: v.created_at, last: v.created_at };
    e.count++;
    if (v.created_at < e.first) e.first = v.created_at;
    if (v.created_at > e.last) e.last = v.created_at;
    m.set(k, e);
  });
  return Array.from(m.values()).sort((a, b) => b.last.localeCompare(a.last));
}
function buildAssignmentByEmail(assignmentViews: Stats["assignmentViews"]) {
  const m = new Map<string, { email: string; assignment: string; count: number; first: string; last: string }>();
  assignmentViews.forEach(v => {
    const assignment = `${v.company || "—"} — ${v.role || "—"}${v.round ? ` · ${v.round}` : ""}`;
    const k = `${v.user_email}|${assignment}`;
    const e = m.get(k) || { email: v.user_email, assignment, count: 0, first: v.created_at, last: v.created_at };
    e.count++;
    if (v.created_at < e.first) e.first = v.created_at;
    if (v.created_at > e.last) e.last = v.created_at;
    m.set(k, e);
  });
  return Array.from(m.values()).sort((a, b) => b.last.localeCompare(a.last));
}
function buildVideoByEmail(videoViews: Stats["videoViews"]) {
  const m = new Map<string, { email: string; video: string; count: number; first: string; last: string }>();
  videoViews.forEach(v => {
    const video = `${v.topic || "—"} (${v.role || "—"} · ${v.yoe || "—"})`;
    const k = `${v.user_email}|${video}`;
    const e = m.get(k) || { email: v.user_email, video, count: 0, first: v.created_at, last: v.created_at };
    e.count++;
    if (v.created_at < e.first) e.first = v.created_at;
    if (v.created_at > e.last) e.last = v.created_at;
    m.set(k, e);
  });
  return Array.from(m.values()).sort((a, b) => b.last.localeCompare(a.last));
}
function buildFeedbackRows(feedback: Stats["feedback"]) {
  return [...feedback].sort((a, b) => b.created_at.localeCompare(a.created_at));
}
function buildPerUser(views: Stats["views"], sessions: Stats["sessions"]) {
  const m = new Map<string, { views: number; minutes: number; last: string }>();
  views.forEach(v => {
    const e = m.get(v.user_email) || { views: 0, minutes: 0, last: v.created_at };
    e.views++;
    if (v.created_at > e.last) e.last = v.created_at;
    m.set(v.user_email, e);
  });
  sessions.forEach(s => {
    const e = m.get(s.user_email) || { views: 0, minutes: 0, last: s.started_at };
    e.minutes += (s.duration_sec || 0) / 60;
    if (s.started_at > e.last) e.last = s.started_at;
    m.set(s.user_email, e);
  });
  return Array.from(m.entries())
    .map(([email, e]) => ({ email, views: e.views, minutes: Math.round(e.minutes), last: e.last }))
    .sort((a, b) => b.views - a.views);
}
function buildPacketPerUser(packetViews: Stats["packetViews"]) {
  const m = new Map<string, { packetsRead: number; first: string; last: string }>();
  packetViews.forEach(v => {
    const e = m.get(v.user_email) || { packetsRead: 0, first: v.created_at, last: v.created_at };
    e.packetsRead++;
    if (v.created_at < e.first) e.first = v.created_at;
    if (v.created_at > e.last) e.last = v.created_at;
    m.set(v.user_email, e);
  });
  return Array.from(m.entries()).map(([email, e]) => ({ email, ...e })).sort((a, b) => b.packetsRead - a.packetsRead);
}

async function fetchStatsWindow(from: string, to: string): Promise<Stats | null> {
  const params = new URLSearchParams({ range: "custom", from, to });
  const res = await fetch(`/api/admin/stats?${params.toString()}`);
  const j = await res.json().catch(() => ({ ok: false }));
  return j.ok ? j : null;
}

// "Export CSV" button that first asks which date window to export, instead
// of silently reusing whatever range the dashboard happens to be showing —
// it re-fetches scoped to exactly that window so the file is self-contained.
function ExportButton({
  defaultFrom, defaultTo, onExport, label = "Export CSV", className,
}: {
  defaultFrom: string; defaultTo: string;
  onExport: (from: string, to: string) => Promise<void>;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo]     = useState(defaultTo);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setFrom(defaultFrom); setTo(defaultTo); }, [defaultFrom, defaultTo]);

  const go = async () => {
    setBusy(true);
    await onExport(from, to);
    setBusy(false);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={className || "rounded-xl border border-edge px-3 py-2 text-sm text-mute hover:text-text"}
      >{label}</button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-edge bg-panel p-3 shadow-cardH">
          <div className="mb-2 text-xs text-mute">Pick the date window to export</div>
          <div className="mb-3 flex items-center gap-1.5">
            <input
              type="date" value={from} max={to}
              onChange={e => setFrom(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-edge bg-panel2 px-1.5 py-1 text-sm text-text [color-scheme:inherit]"
            />
            <span className="text-mute">→</span>
            <input
              type="date" value={to} min={from} max={todayStr()}
              onChange={e => setTo(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-edge bg-panel2 px-1.5 py-1 text-sm text-text [color-scheme:inherit]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="rounded-lg px-2.5 py-1 text-xs text-mute hover:text-text">Cancel</button>
            <button onClick={go} disabled={busy} className="rounded-lg bg-text px-3 py-1 text-xs font-medium text-ink disabled:opacity-50">
              {busy ? "Exporting…" : "Download"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard({ me }: { me: string }) {
  const [range, setRange] = useState<"day" | "week" | "15d" | "month" | "custom">("week");
  const [customFrom, setCustomFrom] = useState(daysAgoStr(7));
  const [customTo, setCustomTo]     = useState(todayStr());
  const [data, setData]   = useState<Stats | null>(null);
  const [newAdmin, setNewAdmin] = useState("");
  const [loading, setLoading]   = useState(false);
  const [breakdownQuery, setBreakdownQuery] = useState("");
  const [topicQuery, setTopicQuery] = useState("");
  const [packetQuery, setPacketQuery] = useState("");
  const [assignmentQuery, setAssignmentQuery] = useState("");
  const [videoQuery, setVideoQuery] = useState("");
  const [feedbackQuery, setFeedbackQuery] = useState("");
  const [hardRefreshing, setHardRefreshing] = useState(false);
  const [hardRefreshMsg, setHardRefreshMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams({ range });
    if (range === "custom") { params.set("from", customFrom); params.set("to", customTo); }
    const res = await fetch(`/api/admin/stats?${params.toString()}`);
    const j   = await res.json();
    setData(j.ok ? j : null);
    setLoading(false);
  };
  useEffect(() => { load(); }, [range]);

  const applyCustomRange = () => {
    if (range === "custom") load();
    else setRange("custom");
  };

  const uniqueUsers = useMemo(() => {
    if (!data) return 0;
    return new Set(data.sessions.map(s => s.user_email).concat(data.views.map(v => v.user_email))).size;
  }, [data]);

  const bucketDays = useMemo(() => {
    if (range === "day") return 1;
    if (range === "15d") return 15;
    if (range === "month") return 30;
    if (range === "custom") {
      const ms = new Date(`${customTo}T00:00:00Z`).getTime() - new Date(`${customFrom}T00:00:00Z`).getTime();
      return Math.max(1, Math.min(90, Math.round(ms / 86400_000) + 1));
    }
    return 7;
  }, [range, customFrom, customTo]);

  // One bucket per day, three independent activity signals so each graph
  // answers a single unambiguous question instead of one chart with a vague
  // "views"/"users" pair nobody can interpret without reading the code:
  //   - activeUsers: opened the site at all (a session exists that day)
  //   - searchedUsers: narrowed the Questions/Assignments filters to a company+role
  //   - packetUsers / videoUsers: actually read a packet / watched a video that day
  const activityBuckets = useMemo(() => {
    if (!data) return [];
    const end = range === "custom" ? new Date(`${customTo}T00:00:00Z`) : new Date();
    const map = new Map<string, { day: string; active: Set<string>; searched: Set<string>; packets: Set<string>; videos: Set<string> }>();
    for (let i = bucketDays - 1; i >= 0; i--) {
      const d = new Date(end.getTime() - i * 86400_000);
      const k = d.toISOString().slice(0, 10);
      map.set(k, { day: k.slice(5), active: new Set(), searched: new Set(), packets: new Set(), videos: new Set() });
    }
    data.sessions.forEach(s => { map.get(s.started_at.slice(0, 10))?.active.add(s.user_email); });
    data.views.forEach(v => { map.get(v.created_at.slice(0, 10))?.searched.add(v.user_email); });
    data.packetViews.forEach(v => { map.get(v.created_at.slice(0, 10))?.packets.add(v.user_email); });
    data.videoViews.forEach(v => { map.get(v.created_at.slice(0, 10))?.videos.add(v.user_email); });
    return Array.from(map.values()).map(b => ({
      day: b.day,
      activeUsers: b.active.size,
      searchedUsers: b.searched.size,
      packetUsers: b.packets.size,
      videoUsers: b.videos.size,
    }));
  }, [data, bucketDays, range, customTo]);

  // Grain is (email, program, company, role) so you can see *who* read what, not just totals.
  const companyRoleBreakdownAll = useMemo(() => data ? buildCompanyRoleBreakdown(data.views) : [], [data]);
  const companyRoleBreakdown = useMemo(() => {
    const qL = breakdownQuery.trim().toLowerCase();
    if (!qL) return companyRoleBreakdownAll;
    return companyRoleBreakdownAll.filter(r =>
      r.email.toLowerCase().includes(qL) ||
      r.company.toLowerCase().includes(qL) ||
      r.role.toLowerCase().includes(qL) ||
      r.program.toLowerCase().includes(qL)
    );
  }, [companyRoleBreakdownAll, breakdownQuery]);

  // Grain is (email, topic) — separate from the company/role breakdown
  // above since a topic search can happen with or without a company/role
  // also picked, and either way it's worth seeing on its own.
  const topicBreakdownAll = useMemo(() => data ? buildTopicBreakdown(data.views) : [], [data]);
  const topicBreakdown = useMemo(() => {
    const qL = topicQuery.trim().toLowerCase();
    if (!qL) return topicBreakdownAll;
    return topicBreakdownAll.filter(r => r.email.toLowerCase().includes(qL) || r.topic.toLowerCase().includes(qL));
  }, [topicBreakdownAll, topicQuery]);

  const perUser = useMemo(() => data ? buildPerUser(data.views, data.sessions) : [], [data]);

  // Email-level totals, used for the CSV summary export.
  const packetPerUser = useMemo(() => data ? buildPacketPerUser(data.packetViews) : [], [data]);

  // Top 20 for the chart — a bar per unique user gets unreadable past that.
  const packetsByUserChart = useMemo(
    () => packetPerUser.slice(0, 20).map(u => ({ email: u.email.split("@")[0], packetsRead: u.packetsRead })),
    [packetPerUser]
  );

  // Grain is (email, packet) so it's clear *who* read *which* packet, how many times,
  // and the oldest/most recent read — same shape as the company/role breakdown above.
  const packetByEmailAll = useMemo(() => data ? buildPacketByEmail(data.packetViews) : [], [data]);
  const packetByEmail = useMemo(() => {
    const qL = packetQuery.trim().toLowerCase();
    if (!qL) return packetByEmailAll;
    return packetByEmailAll.filter(r => r.email.toLowerCase().includes(qL) || r.packet.toLowerCase().includes(qL));
  }, [packetByEmailAll, packetQuery]);

  // Same tracking shape as packets: grain is (email, assignment) with
  // first/last/count, so you can see *who* opened *which* assignment link.
  const assignmentByEmailAll = useMemo(() => data ? buildAssignmentByEmail(data.assignmentViews) : [], [data]);
  const assignmentByEmail = useMemo(() => {
    const qL = assignmentQuery.trim().toLowerCase();
    if (!qL) return assignmentByEmailAll;
    return assignmentByEmailAll.filter(r => r.email.toLowerCase().includes(qL) || r.assignment.toLowerCase().includes(qL));
  }, [assignmentByEmailAll, assignmentQuery]);

  // Same shape again: grain is (email, video) with first/last/count.
  const videoByEmailAll = useMemo(() => data ? buildVideoByEmail(data.videoViews) : [], [data]);
  const videoByEmail = useMemo(() => {
    const qL = videoQuery.trim().toLowerCase();
    if (!qL) return videoByEmailAll;
    return videoByEmailAll.filter(r => r.email.toLowerCase().includes(qL) || r.video.toLowerCase().includes(qL));
  }, [videoByEmailAll, videoQuery]);

  const feedbackRowsAll = useMemo(() => data ? buildFeedbackRows(data.feedback) : [], [data]);
  const feedbackRows = useMemo(() => {
    const qL = feedbackQuery.trim().toLowerCase();
    if (!qL) return feedbackRowsAll;
    return feedbackRowsAll.filter(r =>
      r.user_email.toLowerCase().includes(qL) || (r.feedback_text || "").toLowerCase().includes(qL)
    );
  }, [feedbackRowsAll, feedbackQuery]);
  const avgPlatformRating = useMemo(
    () => feedbackRowsAll.length ? feedbackRowsAll.reduce((s, r) => s + r.platform_rating, 0) / feedbackRowsAll.length : 0,
    [feedbackRowsAll]
  );
  const avgUsefulnessRating = useMemo(
    () => feedbackRowsAll.length ? feedbackRowsAll.reduce((s, r) => s + r.usefulness_rating, 0) / feedbackRowsAll.length : 0,
    [feedbackRowsAll]
  );

  const addAdmin = async () => {
    if (!newAdmin.includes("@")) return;
    await fetch("/api/admin/add-admin", { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify({ email: newAdmin }) });
    setNewAdmin("");
    load();
  };
  const removeAdmin = async (email: string) => {
    if (!confirm(`Remove admin ${email}?`)) return;
    await fetch("/api/admin/add-admin", { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify({ email, action: "remove" }) });
    load();
  };

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

  // Every export re-fetches scoped to whatever window the user picks in the
  // ExportButton popover — independent of whatever range the dashboard is
  // currently showing, so the file always matches the window you asked for.
  const exportCsv = async (from: string, to: string) => {
    const d = await fetchStatsWindow(from, to);
    if (!d) { alert("Couldn't load data for that range."); return; }
    const perU = buildPerUser(d.views, d.sessions);
    const packetU = buildPacketPerUser(d.packetViews);
    const emails = new Set<string>([...perU.map(u => u.email), ...packetU.map(u => u.email)]);
    const byEmail = Array.from(emails).map(email => {
      const u = perU.find(x => x.email === email);
      const p = packetU.find(x => x.email === email);
      const last = [u?.last, p?.last].filter(Boolean).sort().pop();
      return {
        email,
        views: u?.views ?? 0,
        minutes: u?.minutes ?? 0,
        packetsRead: p?.packetsRead ?? 0,
        last: last ? new Date(last).toLocaleString() : "",
      };
    }).sort((a, b) => a.email.localeCompare(b.email));

    const rows: (string | number)[][] = [
      ["Email", "Views", "Minutes", "Packets Read", "Last Activity"],
      ...byEmail.map(u => [u.email, u.views, u.minutes, u.packetsRead, u.last]),
    ];
    downloadCsv(`admin-usage-${from}_to_${to}.csv`, rows);
  };

  const exportCompanyBreakdownCsv = async (from: string, to: string) => {
    const d = await fetchStatsWindow(from, to);
    if (!d) { alert("Couldn't load data for that range."); return; }
    const rows: (string | number)[][] = [
      ["Program", "Company", "Role", "Email", "First time date", "Last time date", "Count"],
      ...buildCompanyRoleBreakdown(d.views).map(r => [
        r.program, r.company, r.role, r.email,
        new Date(r.first).toLocaleString(), new Date(r.last).toLocaleString(), r.views,
      ]),
    ];
    downloadCsv(`admin-company-role-breakdown-${from}_to_${to}.csv`, rows);
  };

  const exportTopicBreakdownCsv = async (from: string, to: string) => {
    const d = await fetchStatsWindow(from, to);
    if (!d) { alert("Couldn't load data for that range."); return; }
    const rows: (string | number)[][] = [
      ["Topic", "Email", "First time date", "Last time date", "Count"],
      ...buildTopicBreakdown(d.views).map(r => [
        r.topic, r.email,
        new Date(r.first).toLocaleString(), new Date(r.last).toLocaleString(), r.count,
      ]),
    ];
    downloadCsv(`admin-topic-breakdown-${from}_to_${to}.csv`, rows);
  };

  const exportPacketBreakdownCsv = async (from: string, to: string) => {
    const d = await fetchStatsWindow(from, to);
    if (!d) { alert("Couldn't load data for that range."); return; }
    const rows: (string | number)[][] = [
      ["Packet", "Email", "First time date", "Last time date", "Count"],
      ...buildPacketByEmail(d.packetViews).map(r => [
        r.packet, r.email,
        new Date(r.first).toLocaleString(), new Date(r.last).toLocaleString(), r.count,
      ]),
    ];
    downloadCsv(`admin-packet-breakdown-${from}_to_${to}.csv`, rows);
  };

  const exportAssignmentBreakdownCsv = async (from: string, to: string) => {
    const d = await fetchStatsWindow(from, to);
    if (!d) { alert("Couldn't load data for that range."); return; }
    const rows: (string | number)[][] = [
      ["Assignment", "Email", "First time date", "Last time date", "Count"],
      ...buildAssignmentByEmail(d.assignmentViews).map(r => [
        r.assignment, r.email,
        new Date(r.first).toLocaleString(), new Date(r.last).toLocaleString(), r.count,
      ]),
    ];
    downloadCsv(`admin-assignment-breakdown-${from}_to_${to}.csv`, rows);
  };

  const exportVideoBreakdownCsv = async (from: string, to: string) => {
    const d = await fetchStatsWindow(from, to);
    if (!d) { alert("Couldn't load data for that range."); return; }
    const rows: (string | number)[][] = [
      ["Video", "Email", "First time date", "Last time date", "Count"],
      ...buildVideoByEmail(d.videoViews).map(r => [
        r.video, r.email,
        new Date(r.first).toLocaleString(), new Date(r.last).toLocaleString(), r.count,
      ]),
    ];
    downloadCsv(`admin-video-breakdown-${from}_to_${to}.csv`, rows);
  };

  const exportFeedbackCsv = async (from: string, to: string) => {
    const d = await fetchStatsWindow(from, to);
    if (!d) { alert("Couldn't load data for that range."); return; }
    const rows: (string | number)[][] = [
      ["Email", "Platform Rating", "Usefulness Rating", "Feedback", "Submitted At"],
      ...buildFeedbackRows(d.feedback).map(r => [
        r.user_email, r.platform_rating, r.usefulness_rating, r.feedback_text || "", new Date(r.created_at).toLocaleString(),
      ]),
    ];
    downloadCsv(`admin-feedback-${from}_to_${to}.csv`, rows);
  };

  return (
    <div className="space-y-10">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="font-mono text-[11px] uppercase tracking-widest text-mute">Admin</span>
          <h1 className="mt-1 font-display text-4xl leading-tight">Usage & reach</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1.5">
            {RANGES.map(r => (
              <button key={r.k}
                onClick={() => setRange(r.k as any)}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${range === r.k ? "border-text bg-text text-ink" : "border-edge text-mute hover:text-text"}`}
              >{r.label}</button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-edge px-2 py-1">
            <input
              type="date" value={customFrom} max={customTo}
              onChange={e => setCustomFrom(e.target.value)}
              className="rounded-md bg-transparent px-1.5 py-0.5 text-sm text-text [color-scheme:inherit]"
            />
            <span className="text-mute">→</span>
            <input
              type="date" value={customTo} min={customFrom} max={todayStr()}
              onChange={e => setCustomTo(e.target.value)}
              className="rounded-md bg-transparent px-1.5 py-0.5 text-sm text-text [color-scheme:inherit]"
            />
            <button
              onClick={applyCustomRange}
              className={`ml-1 rounded-full border px-3 py-1 text-sm transition ${range === "custom" ? "border-text bg-text text-ink" : "border-edge text-mute hover:text-text"}`}
            >Go</button>
          </div>
          <ExportButton
            defaultFrom={customFrom} defaultTo={customTo} onExport={exportCsv}
            label="Download CSV"
            className="rounded-full bg-text px-3.5 py-1.5 text-sm font-medium text-ink transition hover:opacity-90"
          />
        </div>
      </section>

      <SectionLabel accent="acad">Overview</SectionLabel>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Unique users" value={uniqueUsers} accent="acad" />
        <Stat label="Total views" value={data?.views.length ?? 0} accent="dsml" />
        <Stat label="Admins" value={data?.admins.length ?? 0} accent="devops" />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Daily active users — opened the site" accent="acad">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={activityBuckets}>
              <CartesianGrid stroke="rgb(var(--edge))" vertical={false} />
              <XAxis dataKey="day" stroke="rgb(var(--mute))" fontSize={11} />
              <YAxis stroke="rgb(var(--mute))" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "rgb(var(--panel))", border: "1px solid rgb(var(--edge))", borderRadius: 8, color: "rgb(var(--text))" }} />
              <Line type="monotone" dataKey="activeUsers" name="Active users" stroke="rgb(var(--acad))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Daily searches — company/role/topic" accent="dsml">
          <p className="mb-2 text-xs text-mute">Learners who narrowed the filters to a specific company & role, or a topic, that day.</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={activityBuckets}>
              <CartesianGrid stroke="rgb(var(--edge))" vertical={false} />
              <XAxis dataKey="day" stroke="rgb(var(--mute))" fontSize={11} />
              <YAxis stroke="rgb(var(--mute))" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "rgb(var(--panel))", border: "1px solid rgb(var(--edge))", borderRadius: 8, color: "rgb(var(--text))" }} />
              <Line type="monotone" dataKey="searchedUsers" name="Searched users" stroke="rgb(var(--dsml))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Daily content engagement" accent="aiml">
          <p className="mb-2 text-xs text-mute">Learners who read at least one packet, or watched at least one video resource, that day.</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={activityBuckets}>
              <CartesianGrid stroke="rgb(var(--edge))" vertical={false} />
              <XAxis dataKey="day" stroke="rgb(var(--mute))" fontSize={11} />
              <YAxis stroke="rgb(var(--mute))" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "rgb(var(--panel))", border: "1px solid rgb(var(--edge))", borderRadius: 8, color: "rgb(var(--text))" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="packetUsers" name="Read a packet" stroke="rgb(var(--aiml))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="videoUsers" name="Watched a video" stroke="rgb(var(--devops))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Packets opened — by unique user (top 20)" accent="devops">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={packetsByUserChart}>
              <CartesianGrid stroke="rgb(var(--edge))" vertical={false} />
              <XAxis dataKey="email" stroke="rgb(var(--mute))" fontSize={10} angle={-35} textAnchor="end" interval={0} height={60} />
              <YAxis stroke="rgb(var(--mute))" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "rgb(var(--panel))", border: "1px solid rgb(var(--edge))", borderRadius: 8, color: "rgb(var(--text))" }} />
              <Bar dataKey="packetsRead" fill="rgb(var(--devops))" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
          {packetsByUserChart.length === 0 && (
            <div className="py-4 text-center text-sm text-mute">No packet activity yet in this window.</div>
          )}
        </Card>
      </section>

      <SectionLabel accent="acad">Learner activity</SectionLabel>

      <Card title={`Company & role breakdown (${companyRoleBreakdown.length})`} accent="acad">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={breakdownQuery}
            onChange={e => setBreakdownQuery(e.target.value)}
            placeholder="filter by email, company, role, or program..."
            className="min-w-[220px] flex-1 rounded-xl border border-edge bg-panel2 px-3 py-2 text-sm text-text placeholder:text-mute/60 focus:border-acad focus:outline-none"
          />
          <ExportButton defaultFrom={customFrom} defaultTo={customTo} onExport={exportCompanyBreakdownCsv} />
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-panel text-left font-mono text-[11px] uppercase tracking-widest text-mute">
              <tr>
                <th className="py-2">Email</th>
                <th className="py-2">Program</th>
                <th className="py-2">Company</th>
                <th className="py-2">Role</th>
                <th className="py-2">First viewed</th>
                <th className="py-2">Last viewed</th>
                <th className="py-2 text-right">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge/60">
              {companyRoleBreakdown.length === 0 && (
                <tr><td colSpan={7} className="py-4 text-mute">No views yet in this window.</td></tr>
              )}
              {companyRoleBreakdown.map(r => (
                <tr key={`${r.email}|${r.program}|${r.company}|${r.role}`}>
                  <td className="py-2">{r.email}</td>
                  <td className="py-2 font-mono text-xs text-mute">{r.program}</td>
                  <td className="py-2">{r.company}</td>
                  <td className="py-2 text-mute">{r.role}</td>
                  <td className="py-2 font-mono text-xs text-mute">{new Date(r.first).toLocaleString()}</td>
                  <td className="py-2 font-mono text-xs text-mute">{new Date(r.last).toLocaleString()}</td>
                  <td className="py-2 text-right font-mono text-xs">{r.views}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={`Topic breakdown (${topicBreakdown.length})`} accent="topic">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={topicQuery}
            onChange={e => setTopicQuery(e.target.value)}
            placeholder="filter by email or topic..."
            className="min-w-[220px] flex-1 rounded-xl border border-edge bg-panel2 px-3 py-2 text-sm text-text placeholder:text-mute/60 focus:border-acad focus:outline-none"
          />
          <ExportButton defaultFrom={customFrom} defaultTo={customTo} onExport={exportTopicBreakdownCsv} />
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-panel text-left font-mono text-[11px] uppercase tracking-widest text-mute">
              <tr>
                <th className="py-2">Email</th>
                <th className="py-2">Topic</th>
                <th className="py-2">First searched</th>
                <th className="py-2">Last searched</th>
                <th className="py-2 text-right">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge/60">
              {topicBreakdown.length === 0 && (
                <tr><td colSpan={5} className="py-4 text-mute">No topic searches yet in this window.</td></tr>
              )}
              {topicBreakdown.map(r => (
                <tr key={`${r.email}|${r.topic}`}>
                  <td className="py-2">{r.email}</td>
                  <td className="py-2 text-mute">{r.topic}</td>
                  <td className="py-2 font-mono text-xs text-mute">{new Date(r.first).toLocaleString()}</td>
                  <td className="py-2 font-mono text-xs text-mute">{new Date(r.last).toLocaleString()}</td>
                  <td className="py-2 text-right font-mono text-xs">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={`Users (${perUser.length})`} accent="dsml">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left font-mono text-[11px] uppercase tracking-widest text-mute">
              <tr><th className="py-2">Email</th><th className="py-2">Views</th><th className="py-2">Time on site</th><th className="py-2">Last seen</th></tr>
            </thead>
            <tbody className="divide-y divide-edge/60">
              {perUser.map(u => (
                <tr key={u.email}>
                  <td className="py-2">{u.email}</td>
                  <td className="py-2 font-mono text-xs">{u.views}</td>
                  <td className="py-2 font-mono text-xs">{formatDuration(u.minutes)}</td>
                  <td className="py-2 font-mono text-xs text-mute">{new Date(u.last).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={`Packet reads — by learner (${packetByEmail.length})`} accent="aiml">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={packetQuery}
            onChange={e => setPacketQuery(e.target.value)}
            placeholder="filter by email or packet..."
            className="min-w-[220px] flex-1 rounded-xl border border-edge bg-panel2 px-3 py-2 text-sm text-text placeholder:text-mute/60 focus:border-acad focus:outline-none"
          />
          <ExportButton defaultFrom={customFrom} defaultTo={customTo} onExport={exportPacketBreakdownCsv} />
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-panel text-left font-mono text-[11px] uppercase tracking-widest text-mute">
              <tr>
                <th className="py-2">Email</th>
                <th className="py-2">Packet</th>
                <th className="py-2">First read</th>
                <th className="py-2">Last read</th>
                <th className="py-2 text-right">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge/60">
              {packetByEmail.length === 0 && (
                <tr><td colSpan={5} className="py-4 text-mute">No packet reads yet in this window.</td></tr>
              )}
              {packetByEmail.map(r => (
                <tr key={`${r.email}|${r.packet}`}>
                  <td className="py-2">{r.email}</td>
                  <td className="py-2 text-mute">{r.packet}</td>
                  <td className="py-2 font-mono text-xs text-mute">{new Date(r.first).toLocaleString()}</td>
                  <td className="py-2 font-mono text-xs text-mute">{new Date(r.last).toLocaleString()}</td>
                  <td className="py-2 text-right font-mono text-xs">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={`Assignment opens — by learner (${assignmentByEmail.length})`} accent="dsml">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={assignmentQuery}
            onChange={e => setAssignmentQuery(e.target.value)}
            placeholder="filter by email, company, or role..."
            className="min-w-[220px] flex-1 rounded-xl border border-edge bg-panel2 px-3 py-2 text-sm text-text placeholder:text-mute/60 focus:border-acad focus:outline-none"
          />
          <ExportButton defaultFrom={customFrom} defaultTo={customTo} onExport={exportAssignmentBreakdownCsv} />
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-panel text-left font-mono text-[11px] uppercase tracking-widest text-mute">
              <tr>
                <th className="py-2">Email</th>
                <th className="py-2">Assignment</th>
                <th className="py-2">First opened</th>
                <th className="py-2">Last opened</th>
                <th className="py-2 text-right">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge/60">
              {assignmentByEmail.length === 0 && (
                <tr><td colSpan={5} className="py-4 text-mute">No assignment opens yet in this window.</td></tr>
              )}
              {assignmentByEmail.map(r => (
                <tr key={`${r.email}|${r.assignment}`}>
                  <td className="py-2">{r.email}</td>
                  <td className="py-2 text-mute">{r.assignment}</td>
                  <td className="py-2 font-mono text-xs text-mute">{new Date(r.first).toLocaleString()}</td>
                  <td className="py-2 font-mono text-xs text-mute">{new Date(r.last).toLocaleString()}</td>
                  <td className="py-2 text-right font-mono text-xs">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={`Videos watched — by learner (${videoByEmail.length})`} accent="devops">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={videoQuery}
            onChange={e => setVideoQuery(e.target.value)}
            placeholder="filter by email or topic..."
            className="min-w-[220px] flex-1 rounded-xl border border-edge bg-panel2 px-3 py-2 text-sm text-text placeholder:text-mute/60 focus:border-acad focus:outline-none"
          />
          <ExportButton defaultFrom={customFrom} defaultTo={customTo} onExport={exportVideoBreakdownCsv} />
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-panel text-left font-mono text-[11px] uppercase tracking-widest text-mute">
              <tr>
                <th className="py-2">Email</th>
                <th className="py-2">Video</th>
                <th className="py-2">First watched</th>
                <th className="py-2">Last watched</th>
                <th className="py-2 text-right">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge/60">
              {videoByEmail.length === 0 && (
                <tr><td colSpan={5} className="py-4 text-mute">No video opens yet in this window.</td></tr>
              )}
              {videoByEmail.map(r => (
                <tr key={`${r.email}|${r.video}`}>
                  <td className="py-2">{r.email}</td>
                  <td className="py-2 text-mute">{r.video}</td>
                  <td className="py-2 font-mono text-xs text-mute">{new Date(r.first).toLocaleString()}</td>
                  <td className="py-2 font-mono text-xs text-mute">{new Date(r.last).toLocaleString()}</td>
                  <td className="py-2 text-right font-mono text-xs">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={`Learner feedback (${feedbackRows.length})`} accent="acad">
        <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-sm">
          <div className="rounded-xl border border-edge/60 bg-panel2 px-3 py-2">
            <div className="font-mono text-[10px] uppercase tracking-widest text-mute">Avg. platform rating</div>
            <div className="font-display text-2xl">{avgPlatformRating ? avgPlatformRating.toFixed(1) : "—"}<span className="text-sm text-mute"> / 5</span></div>
          </div>
          <div className="rounded-xl border border-edge/60 bg-panel2 px-3 py-2">
            <div className="font-mono text-[10px] uppercase tracking-widest text-mute">Avg. usefulness rating</div>
            <div className="font-display text-2xl">{avgUsefulnessRating ? avgUsefulnessRating.toFixed(1) : "—"}<span className="text-sm text-mute"> / 5</span></div>
          </div>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={feedbackQuery}
            onChange={e => setFeedbackQuery(e.target.value)}
            placeholder="filter by email or feedback text..."
            className="min-w-[220px] flex-1 rounded-xl border border-edge bg-panel2 px-3 py-2 text-sm text-text placeholder:text-mute/60 focus:border-acad focus:outline-none"
          />
          <ExportButton defaultFrom={customFrom} defaultTo={customTo} onExport={exportFeedbackCsv} />
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-panel text-left font-mono text-[11px] uppercase tracking-widest text-mute">
              <tr>
                <th className="py-2">Email</th>
                <th className="py-2">Platform</th>
                <th className="py-2">Usefulness</th>
                <th className="py-2">Feedback</th>
                <th className="py-2">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge/60">
              {feedbackRows.length === 0 && (
                <tr><td colSpan={5} className="py-4 text-mute">No feedback submitted yet in this window.</td></tr>
              )}
              {feedbackRows.map(r => (
                <tr key={`${r.user_email}|${r.created_at}`}>
                  <td className="py-2">{r.user_email}</td>
                  <td className="py-2 text-acad">{"★".repeat(r.platform_rating)}{"☆".repeat(5 - r.platform_rating)}</td>
                  <td className="py-2 text-acad">{"★".repeat(r.usefulness_rating)}{"☆".repeat(5 - r.usefulness_rating)}</td>
                  <td className="max-w-[280px] py-2 text-mute">{r.feedback_text || "—"}</td>
                  <td className="py-2 font-mono text-xs text-mute">{new Date(r.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <SectionLabel accent="aiml">Content management</SectionLabel>

      <PacketLinksManager />

      <VideoResourcesManager />

      <AssignmentsManager />

      <TopicsManager />

      <QuestionTopicsManager />

      <SectionLabel accent="devops">Access & admins</SectionLabel>

      <LearnerAccessManager />

      <Card title="Admins" accent="devops">
        <div className="mb-4 flex flex-wrap gap-2">
          <input
            value={newAdmin}
            onChange={e => setNewAdmin(e.target.value)}
            placeholder="add.email@scaler.com"
            className="flex-1 rounded-xl border border-edge bg-panel2 px-3 py-2 text-sm"
          />
          <button onClick={addAdmin} className="rounded-xl bg-text px-4 py-2 text-sm font-medium text-ink">Add admin</button>
        </div>
        <div className="divide-y divide-edge/60">
          {data?.admins.map(a => (
            <div key={a.email} className="flex items-center justify-between py-2.5 text-sm">
              <div>
                <div>{a.email}</div>
                <div className="font-mono text-[11px] text-mute">added by {a.added_by || "system"} · {new Date(a.added_at).toLocaleDateString()}</div>
              </div>
              {a.email !== "ankit.mishra@scaler.com" && (
                <button onClick={() => removeAdmin(a.email)} className="rounded-lg border border-edge px-2.5 py-1 text-sm text-mute hover:text-text">Remove</button>
              )}
            </div>
          ))}
        </div>
      </Card>

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

      {loading && (
        <div className="flex flex-col items-center gap-2">
          <FlightSpinner />
          <span className="text-sm text-mute">Loading…</span>
        </div>
      )}
    </div>
  );
}

const ACCENTS = {
  acad:   { bar: "bg-acad",   text: "text-acad" },
  dsml:   { bar: "bg-dsml",   text: "text-dsml" },
  aiml:   { bar: "bg-aiml",   text: "text-aiml" },
  devops: { bar: "bg-devops", text: "text-devops" },
  topic:  { bar: "bg-topic",  text: "text-topic" },
} as const;
type Accent = keyof typeof ACCENTS;

function SectionLabel({ children, accent = "acad" }: { children: React.ReactNode; accent?: Accent }) {
  const a = ACCENTS[accent];
  return (
    <div className="flex items-center gap-2.5 pt-2">
      <span className={`h-4 w-1.5 rounded-full ${a.bar}`} />
      <h2 className="font-display text-2xl font-bold leading-none">{children}</h2>
    </div>
  );
}

function Stat({ label, value, accent = "acad" }: { label: string; value: number | string; accent?: Accent }) {
  const a = ACCENTS[accent];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-edge bg-panel p-5 shadow-card">
      <div className={`absolute inset-x-0 top-0 h-[3px] ${a.bar}`} />
      <div className={`font-mono text-[11px] font-bold uppercase tracking-widest ${a.text}`}>{label}</div>
      <div className="mt-1 font-display text-4xl">{typeof value === "number" ? value.toLocaleString() : value}</div>
    </div>
  );
}
function Card({ title, children, accent = "acad" }: { title: string; children: React.ReactNode; accent?: Accent }) {
  const a = ACCENTS[accent];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-edge bg-panel p-5 shadow-card">
      <div className={`absolute inset-x-0 top-0 h-[3px] ${a.bar}`} />
      <div className={`mb-4 font-mono text-xs font-bold uppercase tracking-widest ${a.text}`}>{title}</div>
      {children}
    </div>
  );
}

"use client";
import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from "recharts";
import { FlightSpinner } from "./FlightLoader";
import PacketLinksManager from "./PacketLinksManager";

type Stats = {
  views: { user_email: string; company: string | null; role: string | null; program: string | null; created_at: string }[];
  sessions: { user_email: string; duration_sec: number; started_at: string }[];
  admins: { email: string; added_at: string; added_by: string | null }[];
  packetViews: { user_email: string; created_at: string; role: string | null; yoe: string | null }[];
};

const RANGES = [
  { k: "day",   label: "24h" },
  { k: "week",  label: "7d"  },
  { k: "month", label: "30d" },
];

const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgoStr = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);

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

export default function AdminDashboard({ me }: { me: string }) {
  const [range, setRange] = useState<"day" | "week" | "month" | "custom">("week");
  const [customFrom, setCustomFrom] = useState(daysAgoStr(7));
  const [customTo, setCustomTo]     = useState(todayStr());
  const [data, setData]   = useState<Stats | null>(null);
  const [newAdmin, setNewAdmin] = useState("");
  const [loading, setLoading]   = useState(false);
  const [breakdownQuery, setBreakdownQuery] = useState("");

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

  const totalMinutes = useMemo(() => {
    if (!data) return 0;
    return Math.round(data.sessions.reduce((s, x) => s + (x.duration_sec || 0), 0) / 60);
  }, [data]);

  const bucketDays = useMemo(() => {
    if (range === "day") return 1;
    if (range === "month") return 30;
    if (range === "custom") {
      const ms = new Date(`${customTo}T00:00:00Z`).getTime() - new Date(`${customFrom}T00:00:00Z`).getTime();
      return Math.max(1, Math.min(90, Math.round(ms / 86400_000) + 1));
    }
    return 7;
  }, [range, customFrom, customTo]);

  const dailyBuckets = useMemo(() => {
    if (!data) return [];
    const end = range === "custom" ? new Date(`${customTo}T00:00:00Z`) : new Date();
    const map = new Map<string, { day: string; views: number; users: Set<string>; minutes: number }>();
    for (let i = bucketDays - 1; i >= 0; i--) {
      const d = new Date(end.getTime() - i * 86400_000);
      const k = d.toISOString().slice(0, 10);
      map.set(k, { day: k.slice(5), views: 0, users: new Set(), minutes: 0 });
    }
    data.views.forEach(v => {
      const k = v.created_at.slice(0, 10);
      const b = map.get(k); if (b) { b.views++; b.users.add(v.user_email); }
    });
    data.sessions.forEach(s => {
      const k = s.started_at.slice(0, 10);
      const b = map.get(k); if (b) { b.minutes += (s.duration_sec || 0) / 60; b.users.add(s.user_email); }
    });
    return Array.from(map.values()).map(b => ({ day: b.day, views: b.views, users: b.users.size, minutes: Math.round(b.minutes) }));
  }, [data, bucketDays, range, customTo]);

  const companyRoleBreakdown = useMemo(() => {
    if (!data) return [];
    const m = new Map<string, { program: string; company: string; role: string; views: number; users: Set<string> }>();
    data.views.forEach(v => {
      if (!v.company || !v.role) return;
      const company = v.company.trim(), role = v.role.trim(), program = v.program?.trim() || "—";
      const k = `${program}|${company}|${role}`;
      const e = m.get(k) || { program, company, role, views: 0, users: new Set<string>() };
      e.views++; e.users.add(v.user_email);
      m.set(k, e);
    });
    const rows = Array.from(m.values())
      .map(e => ({ program: e.program, company: e.company, role: e.role, views: e.views, users: e.users.size }))
      .sort((a, b) => b.views - a.views);
    const qL = breakdownQuery.trim().toLowerCase();
    if (!qL) return rows;
    return rows.filter(r => r.company.toLowerCase().includes(qL) || r.role.toLowerCase().includes(qL) || r.program.toLowerCase().includes(qL));
  }, [data, breakdownQuery]);

  const perUser = useMemo(() => {
    if (!data) return [];
    const m = new Map<string, { views: number; minutes: number; last: string }>();
    data.views.forEach(v => {
      const e = m.get(v.user_email) || { views: 0, minutes: 0, last: v.created_at };
      e.views++;
      if (v.created_at > e.last) e.last = v.created_at;
      m.set(v.user_email, e);
    });
    data.sessions.forEach(s => {
      const e = m.get(s.user_email) || { views: 0, minutes: 0, last: s.started_at };
      e.minutes += (s.duration_sec || 0) / 60;
      if (s.started_at > e.last) e.last = s.started_at;
      m.set(s.user_email, e);
    });
    return Array.from(m.entries())
      .map(([email, e]) => ({ email, views: e.views, minutes: Math.round(e.minutes), last: e.last }))
      .sort((a, b) => b.views - a.views);
  }, [data]);

  // Packets are tracked separately: every open is logged, so re-reading the
  // same packet twice counts twice for that email (not deduped to "read / not read").
  const packetPerUser = useMemo(() => {
    if (!data) return [];
    const m = new Map<string, { packetsRead: number; last: string }>();
    data.packetViews.forEach(v => {
      const e = m.get(v.user_email) || { packetsRead: 0, last: v.created_at };
      e.packetsRead++;
      if (v.created_at > e.last) e.last = v.created_at;
      m.set(v.user_email, e);
    });
    return Array.from(m.entries())
      .map(([email, e]) => ({ email, ...e }))
      .sort((a, b) => b.packetsRead - a.packetsRead);
  }, [data]);

  const packetRoleBreakdown = useMemo(() => {
    if (!data) return [];
    const m = new Map<string, number>();
    data.packetViews.forEach(v => {
      if (!v.role) return;
      const k = `${v.role} · ${v.yoe || "—"}`;
      m.set(k, (m.get(k) || 0) + 1);
    });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ k, v }));
  }, [data]);

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

  const exportCsv = () => {
    const emails = new Set<string>([...perUser.map(u => u.email), ...packetPerUser.map(u => u.email)]);
    const byEmail = Array.from(emails).map(email => {
      const u = perUser.find(x => x.email === email);
      const p = packetPerUser.find(x => x.email === email);
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
    downloadCsv(`admin-usage-${range}-${todayStr()}.csv`, rows);
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
          <button
            onClick={exportCsv}
            className="rounded-full bg-text px-3.5 py-1.5 text-sm font-medium text-ink transition hover:opacity-90"
          >Download CSV</button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Unique users" value={uniqueUsers} />
        <Stat label="Total views" value={data?.views.length ?? 0} />
        <Stat label="Total minutes" value={totalMinutes} />
        <Stat label="Admins" value={data?.admins.length ?? 0} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Daily views & users">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={dailyBuckets}>
              <CartesianGrid stroke="rgb(var(--edge))" vertical={false} />
              <XAxis dataKey="day" stroke="rgb(var(--mute))" fontSize={11} />
              <YAxis stroke="rgb(var(--mute))" fontSize={11} />
              <Tooltip contentStyle={{ background: "rgb(var(--panel))", border: "1px solid rgb(var(--edge))", borderRadius: 8, color: "rgb(var(--text))" }} />
              <Line type="monotone" dataKey="views" stroke="rgb(var(--acad))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="users" stroke="rgb(var(--dsml))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Daily minutes on site">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={dailyBuckets}>
              <CartesianGrid stroke="rgb(var(--edge))" vertical={false} />
              <XAxis dataKey="day" stroke="rgb(var(--mute))" fontSize={11} />
              <YAxis stroke="rgb(var(--mute))" fontSize={11} />
              <Tooltip contentStyle={{ background: "rgb(var(--panel))", border: "1px solid rgb(var(--edge))", borderRadius: 8, color: "rgb(var(--text))" }} />
              <Bar dataKey="minutes" fill="rgb(var(--aiml))" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </section>

      <Card title={`Company & role breakdown (${companyRoleBreakdown.length})`}>
        <input
          value={breakdownQuery}
          onChange={e => setBreakdownQuery(e.target.value)}
          placeholder="filter by company, role, or program..."
          className="mb-4 w-full rounded-xl border border-edge bg-panel2 px-3 py-2 text-sm text-text placeholder:text-mute/60 focus:border-acad focus:outline-none"
        />
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-panel text-left font-mono text-[11px] uppercase tracking-widest text-mute">
              <tr>
                <th className="py-2">Program</th>
                <th className="py-2">Company</th>
                <th className="py-2">Role</th>
                <th className="py-2 text-right">Views</th>
                <th className="py-2 text-right">Unique users</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge/60">
              {companyRoleBreakdown.length === 0 && (
                <tr><td colSpan={5} className="py-4 text-mute">No views yet in this window.</td></tr>
              )}
              {companyRoleBreakdown.map(r => (
                <tr key={`${r.program}|${r.company}|${r.role}`}>
                  <td className="py-2 font-mono text-xs text-mute">{r.program}</td>
                  <td className="py-2">{r.company}</td>
                  <td className="py-2 text-mute">{r.role}</td>
                  <td className="py-2 text-right font-mono text-xs">{r.views}</td>
                  <td className="py-2 text-right font-mono text-xs">{r.users}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={`Users (${perUser.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left font-mono text-[11px] uppercase tracking-widest text-mute">
              <tr><th className="py-2">Email</th><th className="py-2">Views</th><th className="py-2">Minutes</th><th className="py-2">Last seen</th></tr>
            </thead>
            <tbody className="divide-y divide-edge/60">
              {perUser.map(u => (
                <tr key={u.email}>
                  <td className="py-2">{u.email}</td>
                  <td className="py-2 font-mono text-xs">{u.views}</td>
                  <td className="py-2 font-mono text-xs">{u.minutes}</td>
                  <td className="py-2 font-mono text-xs text-mute">{new Date(u.last).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title={`Packets — by user (${packetPerUser.length})`}>
          <div className="max-h-[360px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-panel text-left font-mono text-[11px] uppercase tracking-widest text-mute">
                <tr>
                  <th className="py-2">Email</th>
                  <th className="py-2 text-right">Packets read</th>
                  <th className="py-2">Last activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge/60">
                {packetPerUser.length === 0 && (
                  <tr><td colSpan={3} className="py-4 text-mute">No packet activity yet in this window.</td></tr>
                )}
                {packetPerUser.map(u => (
                  <tr key={u.email}>
                    <td className="py-2">{u.email}</td>
                    <td className="py-2 text-right font-mono text-xs">{u.packetsRead}</td>
                    <td className="py-2 font-mono text-xs text-mute">{new Date(u.last).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Packet reads — by Role & YoE">
          <div className="divide-y divide-edge/60">
            {packetRoleBreakdown.length === 0 && <div className="py-4 text-sm text-mute">No packet reads yet in this window.</div>}
            {packetRoleBreakdown.map(r => (
              <div key={r.k} className="flex items-center justify-between py-2.5">
                <span className="text-sm">{r.k}</span>
                <span className="font-mono text-xs text-mute">{r.v}</span>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <PacketLinksManager />

      <Card title="Admins">
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

      {loading && (
        <div className="flex flex-col items-center gap-2">
          <FlightSpinner />
          <span className="text-sm text-mute">Loading…</span>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-edge bg-panel p-5 shadow-card">
      <div className="font-mono text-[11px] uppercase tracking-widest text-mute">{label}</div>
      <div className="mt-1 font-display text-4xl">{value.toLocaleString()}</div>
    </div>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-edge bg-panel p-5 shadow-card">
      <div className="mb-4 font-mono text-[11px] uppercase tracking-widest text-mute">{title}</div>
      {children}
    </div>
  );
}

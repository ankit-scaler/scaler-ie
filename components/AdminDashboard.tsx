"use client";
import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from "recharts";

type Stats = {
  views: { user_email: string; company: string | null; role: string | null; program: string | null; created_at: string }[];
  sessions: { user_email: string; duration_sec: number; started_at: string }[];
  admins: { email: string; added_at: string; added_by: string | null }[];
};

const RANGES = [
  { k: "day",   label: "24h" },
  { k: "week",  label: "7d"  },
  { k: "month", label: "30d" },
];

export default function AdminDashboard({ me }: { me: string }) {
  const [range, setRange] = useState<"day"|"week"|"month">("week");
  const [data, setData]   = useState<Stats | null>(null);
  const [newAdmin, setNewAdmin] = useState("");
  const [loading, setLoading]   = useState(false);

  const load = async (r = range) => {
    setLoading(true);
    const res = await fetch(`/api/admin/stats?range=${r}`);
    const j   = await res.json();
    setData(j.ok ? j : null);
    setLoading(false);
  };
  useEffect(() => { load(range); }, [range]);

  const uniqueUsers = useMemo(() => {
    if (!data) return 0;
    return new Set(data.sessions.map(s => s.user_email).concat(data.views.map(v => v.user_email))).size;
  }, [data]);

  const totalMinutes = useMemo(() => {
    if (!data) return 0;
    return Math.round(data.sessions.reduce((s, x) => s + (x.duration_sec || 0), 0) / 60);
  }, [data]);

  const dailyBuckets = useMemo(() => {
    if (!data) return [];
    const days = range === "day" ? 1 : range === "month" ? 30 : 7;
    const map = new Map<string, { day: string; views: number; users: Set<string>; minutes: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000);
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
  }, [data, range]);

  const topCompanyRole = useMemo(() => {
    if (!data) return [];
    const m = new Map<string, number>();
    data.views.forEach(v => {
      if (!v.company || !v.role) return;
      const k = `${v.company.trim()} — ${v.role.trim()}`;
      m.set(k, (m.get(k) || 0) + 1);
    });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => ({ k, v }));
  }, [data]);

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

  return (
    <div className="space-y-10">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-mute">Admin</span>
          <h1 className="mt-1 font-display text-4xl leading-tight">Usage & reach</h1>
        </div>
        <div className="flex gap-1.5">
          {RANGES.map(r => (
            <button key={r.k}
              onClick={() => setRange(r.k as any)}
              className={`rounded-full border px-3 py-1.5 text-xs ${range === r.k ? "border-text bg-text text-ink" : "border-edge text-mute hover:text-text"}`}
            >{r.label}</button>
          ))}
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
              <CartesianGrid stroke="#232937" vertical={false} />
              <XAxis dataKey="day" stroke="#8A91A0" fontSize={11} />
              <YAxis stroke="#8A91A0" fontSize={11} />
              <Tooltip contentStyle={{ background: "#12151C", border: "1px solid #232937", borderRadius: 8 }} />
              <Line type="monotone" dataKey="views" stroke="#5B9DFF" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="users" stroke="#B57BFF" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Daily minutes on site">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={dailyBuckets}>
              <CartesianGrid stroke="#232937" vertical={false} />
              <XAxis dataKey="day" stroke="#8A91A0" fontSize={11} />
              <YAxis stroke="#8A91A0" fontSize={11} />
              <Tooltip contentStyle={{ background: "#12151C", border: "1px solid #232937", borderRadius: 8 }} />
              <Bar dataKey="minutes" fill="#5FE3B1" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </section>

      <Card title="Top Company — Role views">
        <div className="divide-y divide-edge/60">
          {topCompanyRole.length === 0 && <div className="py-4 text-sm text-mute">No views yet in this window.</div>}
          {topCompanyRole.map(r => (
            <div key={r.k} className="flex items-center justify-between py-2.5">
              <span className="text-sm">{r.k}</span>
              <span className="font-mono text-xs text-mute">{r.v}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title={`Users (${perUser.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left font-mono text-[10px] uppercase tracking-widest text-mute">
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
                <div className="font-mono text-[10px] text-mute">added by {a.added_by || "system"} · {new Date(a.added_at).toLocaleDateString()}</div>
              </div>
              {a.email !== "ankit.mishra@scaler.com" && (
                <button onClick={() => removeAdmin(a.email)} className="rounded-lg border border-edge px-2.5 py-1 text-xs text-mute hover:text-text">Remove</button>
              )}
            </div>
          ))}
        </div>
      </Card>

      {loading && <div className="text-center text-xs text-mute">Loading…</div>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-edge bg-panel p-5 shadow-card">
      <div className="font-mono text-[10px] uppercase tracking-widest text-mute">{label}</div>
      <div className="mt-1 font-display text-4xl">{value.toLocaleString()}</div>
    </div>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-edge bg-panel p-5 shadow-card">
      <div className="mb-4 font-mono text-[10px] uppercase tracking-widest text-mute">{title}</div>
      {children}
    </div>
  );
}

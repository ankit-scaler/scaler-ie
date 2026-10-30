"use client";
import { useState } from "react";
import LearnerAccessManager from "./LearnerAccessManager";
import { Card } from "./AdminShared";

type Admin = { email: string; added_at: string; added_by: string | null };

export default function AdminAccess({ initialAdmins }: { initialAdmins: Admin[] }) {
  const [admins, setAdmins] = useState<Admin[]>(initialAdmins);
  const [newAdmin, setNewAdmin] = useState("");

  const addAdmin = async () => {
    if (!newAdmin.includes("@")) return;
    const email = newAdmin.trim().toLowerCase();
    await fetch("/api/admin/add-admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
    setAdmins(prev => prev.some(a => a.email === email) ? prev : [...prev, { email, added_at: new Date().toISOString(), added_by: null }]);
    setNewAdmin("");
  };
  const removeAdmin = async (email: string) => {
    if (!confirm(`Remove admin ${email}?`)) return;
    await fetch("/api/admin/add-admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, action: "remove" }) });
    setAdmins(prev => prev.filter(a => a.email !== email));
  };

  return (
    <div className="space-y-10">
      <section>
        <span className="font-mono text-[11px] uppercase tracking-widest text-mute">Admin</span>
        <h1 className="mt-1 font-display text-4xl leading-tight">Access management</h1>
      </section>

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
          {admins.map(a => (
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
    </div>
  );
}

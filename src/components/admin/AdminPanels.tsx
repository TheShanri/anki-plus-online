"use client";

import { useState, useTransition } from "react";
import { createCourse, setUserRole } from "@/app/admin/actions";
import { sendResetEmail, setTemporaryPassword } from "@/app/staff/actions";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "student" | "ta" | "professor" | "admin";
  courses: { id: string; code: string }[];
};

export function CreateCourse() {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-3 sm:grid-cols-4"
      action={(fd) => start(async () => setMsg((await createCourse(fd)).message ?? null))}
    >
      <input className="input" name="code" placeholder="Code (NSCI3250B)" aria-label="Course code" required />
      <input className="input" name="title" placeholder="Title" aria-label="Title" required />
      <input className="input" name="term" placeholder="Term (Fall 2027)" aria-label="Term" />
      <input className="input" name="join_code" placeholder="Join code (blank = random)" aria-label="Join code" />
      <div className="sm:col-span-4 flex items-center gap-3">
        <button className="btn btn-primary" type="submit" disabled={pending}>Create course</button>
        {msg && <span className="text-sm text-text-dim" role="status">{msg}</span>}
      </div>
    </form>
  );
}

export function UsersTable({ users }: { users: UserRow[] }) {
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [, start] = useTransition();
  const list = users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase())).slice(0, 100);
  return (
    <div>
      <input className="input mb-3" placeholder="Search name or email" aria-label="Search users" value={q} onChange={(e) => setQ(e.target.value)} />
      {msg && <p className="notice mb-3" role="status">{msg}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <tbody>
            {list.map((u) => (
              <tr key={u.id} className="border-b border-panel-border/50">
                <td className="px-2 py-2">{u.name}<br /><span className="text-text-faint">{u.email}</span></td>
                <td className="px-2 py-2 text-text-dim">{u.courses.map((c) => c.code).join(", ") || "-"}</td>
                <td className="px-2 py-2">
                  <select
                    className="input"
                    style={{ width: "auto" }}
                    aria-label={`Role of ${u.name}`}
                    value={u.role}
                    onChange={(e) => start(async () => setMsg((await setUserRole(u.id, e.target.value as UserRow["role"])).message ?? null))}
                  >
                    <option value="student">student</option>
                    <option value="ta">ta</option>
                    <option value="professor">professor</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="px-2 py-2 whitespace-nowrap">
                  {u.courses[0] && (
                    <button className="btn" type="button" onClick={() => start(async () => setMsg((await sendResetEmail(u.courses[0].id, u.id)).message ?? null))}>Reset email</button>
                  )}
                  <button
                    className="btn ml-1"
                    type="button"
                    onClick={() => start(async () => {
                      const r = await setTemporaryPassword(u.id);
                      setMsg(r.value ? `${u.email}: temporary password ${r.value}` : (r.message ?? null));
                    })}
                  >
                    Temp password
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

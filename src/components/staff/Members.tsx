"use client";

import { useState, useTransition } from "react";
import { setMemberRole } from "@/app/staff/actions";

export type Member = { userId: string; role: "student" | "ta" | "professor" | "admin"; labSection: string | null; name: string; email: string };

export function Members(props: { courseId: string; members: Member[]; canManage: boolean; isAdmin: boolean; selfId: string }) {
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [, start] = useTransition();
  const list = props.members
    .filter((m) => `${m.name} ${m.email}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 100);

  function change(userId: string, role: "student" | "ta" | "professor") {
    start(async () => setMsg((await setMemberRole(props.courseId, userId, role)).message ?? null));
  }

  return (
    <section className="panel mt-8">
      <h2 className="mb-3 font-display text-lg">Staff and members</h2>
      {msg && <p className="notice mb-3" role="status">{msg}</p>}
      <input className="input mb-3" placeholder="Search name or email" aria-label="Search members" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="divide-y divide-panel-border text-sm">
        {list.map((m) => (
          <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>{m.name} <span className="text-text-faint">{m.email}</span></span>
            <span className="flex items-center gap-2">
              <span className="label m-0">{m.role}</span>
              {props.canManage && m.userId !== props.selfId && (
                <>
                  {m.role === "student" && <button className="btn" type="button" onClick={() => change(m.userId, "ta")}>Make TA</button>}
                  {m.role === "ta" && <button className="btn" type="button" onClick={() => change(m.userId, "student")}>Remove TA</button>}
                  {props.isAdmin && m.role !== "professor" && m.role !== "admin" && (
                    <button className="btn" type="button" onClick={() => change(m.userId, "professor")}>Make professor</button>
                  )}
                  {props.isAdmin && m.role === "professor" && <button className="btn" type="button" onClick={() => change(m.userId, "student")}>Make student</button>}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

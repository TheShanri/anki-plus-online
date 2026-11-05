"use client";

import { useMemo, useState, useTransition } from "react";
import { sendResetEmail, setTemporaryPassword } from "@/app/staff/actions";

export type RosterRow = {
  user_id: string;
  display_name: string;
  pronouns: string | null;
  lab_section: string | null;
  email: string;
  weeks_min: number[]; // index 0 = this week, then the 8 weeks before
  sessions: number;
  cards_reviewed: number;
  accuracy: number | null;
  streak: number;
  last_seen: string | null;
};
export type WeakRow = {
  level: "topic" | "structure";
  unit_title: string | null;
  unit_position: number | null;
  topic_id: string;
  topic_title: string;
  topic_position: number | null;
  structure_id: string | null;
  structure_name: string | null;
  students: number;
  attempts: number;
  miss_rate: number;
};
export type AtRisk = {
  user_id: string;
  display_name: string;
  lab_section: string | null;
  reason: string;
  days_inactive: number;
  recent_min: number;
  median_min: number;
};

type SortKey = "name" | "section" | "week" | "sessions" | "cards" | "accuracy" | "streak" | "last";

function Sparkline({ values }: { values: number[] }) {
  // Oldest on the left, this week on the right.
  const v = [...values].reverse();
  const max = Math.max(1, ...v);
  const w = 72;
  const h = 20;
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * w).toFixed(1)},${(h - 2 - (x / max) * (h - 4)).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Active minutes per week, last 9 weeks">
      <polyline points={pts} fill="none" stroke="var(--accent-2)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function ago(iso: string | null): string {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function Dashboard(props: {
  courseId: string;
  courseCode: string;
  sections: string[];
  roster: RosterRow[];
  weak: WeakRow[];
  atRisk: AtRisk[];
  isAdmin: boolean;
}) {
  const { roster, weak, atRisk } = props;
  const [section, setSection] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [msg, setMsg] = useState<string | null>(null);
  const [, start] = useTransition();

  const rows = useMemo(() => {
    const f = roster.filter((r) => !section || r.lab_section === section);
    const val = (r: RosterRow): string | number => {
      switch (sort.key) {
        case "name": return r.display_name.toLowerCase();
        case "section": return r.lab_section ?? "";
        case "week": return r.weeks_min[0] ?? 0;
        case "sessions": return r.sessions;
        case "cards": return r.cards_reviewed;
        case "accuracy": return r.accuracy ?? -1;
        case "streak": return r.streak;
        case "last": return r.last_seen ? new Date(r.last_seen).getTime() : 0;
      }
    };
    return [...f].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * sort.dir);
  }, [roster, section, sort]);

  function th(key: SortKey, label: string) {
    const on = sort.key === key;
    return (
      <th className="px-2 py-2 text-left font-normal" aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
        <button type="button" className="label m-0 cursor-pointer" onClick={() => setSort({ key, dir: on && sort.dir === 1 ? -1 : 1 })}>
          {label}{on ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
        </button>
      </th>
    );
  }

  function exportCsv() {
    const head = ["Name", "Pronouns", "Lab section", "Email", "Minutes this week", ...Array.from({ length: 8 }, (_, i) => `Minutes ${i + 1} wk ago`),
      "Sessions", "Cards reviewed", "Accuracy %", "Streak (days)", "Last seen"];
    const lines = [head, ...rows.map((r) => [r.display_name, r.pronouns, r.lab_section, r.email, ...r.weeks_min.slice(0, 9),
      r.sessions, r.cards_reviewed, r.accuracy, r.streak, r.last_seen])].map((l) => l.map(csvCell).join(","));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${props.courseCode}-summary-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function reset(userId: string) {
    start(async () => setMsg((await sendResetEmail(props.courseId, userId)).message ?? null));
  }
  function temp(userId: string) {
    start(async () => {
      const r = await setTemporaryPassword(userId);
      setMsg(r.value ? `${r.message} Temporary password: ${r.value}` : (r.message ?? null));
    });
  }

  // heatmap: unit -> topic -> structures
  const topics = weak.filter((w) => w.level === "topic");
  const structs = weak.filter((w) => w.level === "structure");
  const byUnit = new Map<string, { pos: number; topics: WeakRow[] }>();
  for (const t of topics) {
    const k = t.unit_title ?? "Other";
    if (!byUnit.has(k)) byUnit.set(k, { pos: t.unit_position ?? 999, topics: [] });
    byUnit.get(k)!.topics.push(t);
  }
  const heat = (rate: number) => `color-mix(in srgb, var(--again) ${Math.round(Math.min(100, rate) * 0.9)}%, var(--panel-solid))`;

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="panel"><p className="label">Students</p><p className="font-display text-3xl">{roster.length}</p></div>
        <div className="panel"><p className="label">Active this week</p><p className="font-display text-3xl">{roster.filter((r) => (r.weeks_min[0] ?? 0) > 0).length}</p></div>
        <div className="panel"><p className="label">At risk</p><p className="font-display text-3xl">{atRisk.length}</p></div>
      </div>

      {msg && <p className="notice" role="status">{msg}</p>}

      <section className="panel">
        <h2 className="mb-3 font-display text-lg">At-risk students</h2>
        {atRisk.length === 0 ? (
          <p className="text-sm text-text-dim">Nobody is flagged right now.</p>
        ) : (
          <ul className="divide-y divide-panel-border text-sm">
            {atRisk.map((a) => (
              <li key={a.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><b>{a.display_name}</b> {a.lab_section && <span className="text-text-dim">({a.lab_section})</span>} <span className="text-text-dim">· {a.reason}</span></span>
                <button className="btn" type="button" onClick={() => reset(a.user_id)}>Send reset email</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg">Roster</h2>
          <div className="flex items-center gap-2">
            <select className="input" style={{ width: "auto" }} aria-label="Filter by lab section" value={section} onChange={(e) => setSection(e.target.value)}>
              <option value="">All sections</option>
              {props.sections.map((s) => <option key={s}>{s}</option>)}
            </select>
            <button className="btn" type="button" onClick={exportCsv}>Export CSV</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-panel-border">
                {th("name", "Name")}{th("section", "Section")}{th("week", "Min this week")}
                <th className="px-2 py-2 text-left font-normal"><span className="label m-0">9 weeks</span></th>
                {th("sessions", "Sessions")}{th("cards", "Cards")}{th("accuracy", "Accuracy")}{th("streak", "Streak")}{th("last", "Last seen")}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user_id} className="border-b border-panel-border/50">
                  <td className="px-2 py-2">{r.display_name}{r.pronouns && <span className="text-text-faint"> ({r.pronouns})</span>}</td>
                  <td className="px-2 py-2">{r.lab_section ?? "-"}</td>
                  <td className="px-2 py-2">{Math.round(r.weeks_min[0] ?? 0)}</td>
                  <td className="px-2 py-2"><Sparkline values={r.weeks_min} /></td>
                  <td className="px-2 py-2">{r.sessions}</td>
                  <td className="px-2 py-2">{r.cards_reviewed}</td>
                  <td className="px-2 py-2">{r.accuracy == null ? "-" : `${r.accuracy}%`}</td>
                  <td className="px-2 py-2">{r.streak}</td>
                  <td className="px-2 py-2">{ago(r.last_seen)}</td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    <button className="btn" type="button" onClick={() => reset(r.user_id)} title="Email a password reset link">Reset</button>
                    {props.isAdmin && <button className="btn ml-1" type="button" onClick={() => temp(r.user_id)} title="Set a temporary password">Temp pw</button>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={10} className="px-2 py-6 text-center text-text-dim">No students yet. Share the join code from the settings below.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2 className="mb-1 font-display text-lg">Class weak spots</h2>
        <p className="mb-3 text-sm text-text-dim">Share of attempts answered wrong across the whole class (anonymous; shown only when 3 or more students attempted).</p>
        {byUnit.size === 0 ? (
          <p className="text-sm text-text-dim">Not enough data yet.</p>
        ) : (
          [...byUnit.entries()].sort((a, b) => a[1].pos - b[1].pos).map(([unit, u]) => (
            <div key={unit} className="mb-4">
              <h3 className="mb-2 text-sm text-text-dim">{unit}</h3>
              {u.topics.sort((a, b) => (a.topic_position ?? 0) - (b.topic_position ?? 0)).map((t) => (
                <div key={t.topic_id} className="mb-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="inline-block min-w-14 rounded-card-sm px-2 py-0.5 text-center" style={{ background: heat(t.miss_rate), color: "var(--text)" }}>{t.miss_rate}%</span>
                    <b>{t.topic_title}</b>
                    <span className="text-text-faint">{t.students} students</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1 pl-16">
                    {structs.filter((s) => s.topic_id === t.topic_id).sort((a, b) => b.miss_rate - a.miss_rate).map((s) => (
                      <span key={s.structure_id} className="rounded-card-sm px-2 py-0.5 text-xs" style={{ background: heat(s.miss_rate), color: "var(--text)" }}
                        title={`${s.students} students, ${s.attempts} attempts`}>
                        {s.structure_name} {s.miss_rate}%
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </section>
    </div>
  );
}

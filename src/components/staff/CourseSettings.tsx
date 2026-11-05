"use client";

import { useState, useTransition } from "react";
import { regenerateJoinCode, saveCourseSettings } from "@/app/staff/actions";

type S = {
  lab_sections?: string[];
  station_seconds?: number;
  exam_spelling?: string;
  allowed_email_domains?: string[];
  practicals?: { name: string; date: string }[];
  inactivity_days?: number;
};

export function CourseSettings({ course }: { course: { id: string; join_code: string; settings: Record<string, unknown> } }) {
  const s = course.settings as S;
  const [code, setCode] = useState(course.join_code);
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="panel mt-8">
      <h2 className="mb-3 font-display text-lg">Course settings</h2>
      {msg && <p className="notice mb-3" role="status">{msg}</p>}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="label m-0">Join code</span>
        <code className="rounded-card-sm bg-bg-2 px-3 py-1 font-mono">{show ? code : "••••••••••"}</code>
        <button className="btn" type="button" onClick={() => setShow((x) => !x)}>{show ? "Hide" : "Show"}</button>
        <button
          className="btn"
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm("Create a new join code? The old one stops working immediately.")) return;
            start(async () => {
              const r = await regenerateJoinCode(course.id);
              if (r.value) { setCode(r.value); setShow(true); }
              setMsg(r.message ?? null);
            });
          }}
        >
          Regenerate
        </button>
      </div>
      <form
        className="grid gap-4 sm:grid-cols-2"
        action={(fd) => start(async () => setMsg((await saveCourseSettings(course.id, fd)).message ?? null))}
      >
        <div>
          <label className="label" htmlFor="lab_sections">Lab sections (comma or line separated)</label>
          <textarea className="input" id="lab_sections" name="lab_sections" rows={3} defaultValue={(s.lab_sections ?? []).join("\n")} />
        </div>
        <div>
          <label className="label" htmlFor="allowed_email_domains">Allowed email domains</label>
          <textarea className="input" id="allowed_email_domains" name="allowed_email_domains" rows={3} defaultValue={(s.allowed_email_domains ?? ["uvm.edu"]).join("\n")} />
        </div>
        <div>
          <label className="label" htmlFor="station_seconds">Seconds per practical station</label>
          <input className="input" id="station_seconds" name="station_seconds" type="number" min={10} max={600} defaultValue={s.station_seconds ?? 75} />
        </div>
        <div>
          <label className="label" htmlFor="exam_spelling">Exam spelling</label>
          <select className="input" id="exam_spelling" name="exam_spelling" defaultValue={s.exam_spelling ?? "generous"}>
            <option value="generous">Generous</option>
            <option value="strict">Strict</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="inactivity_days">Flag as inactive after (days)</label>
          <input className="input" id="inactivity_days" name="inactivity_days" type="number" min={1} max={60} defaultValue={s.inactivity_days ?? 5} />
        </div>
        <div>
          <label className="label" htmlFor="practicals">Practical dates (Name | YYYY-MM-DD per line)</label>
          <textarea className="input" id="practicals" name="practicals" rows={3}
            defaultValue={(s.practicals ?? []).map((p) => `${p.name} | ${p.date}`).join("\n")} placeholder="Practical 1 | 2027-02-20" />
        </div>
        <div className="sm:col-span-2">
          <button className="btn btn-primary" type="submit" disabled={pending}>Save settings</button>
        </div>
      </form>
    </section>
  );
}

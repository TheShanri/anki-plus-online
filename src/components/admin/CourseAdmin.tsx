"use client";

import { useState, useTransition } from "react";
import { saveCourseBasics } from "@/app/admin/actions";
import { regenerateJoinCode } from "@/app/staff/actions";

export type CourseRow = {
  id: string;
  code: string;
  title: string;
  term: string | null;
  join_code: string;
  members: number;
  station_seconds: number;
  exam_spelling: "strict" | "generous";
};

export function CourseAdmin({ course }: { course: CourseRow }) {
  const [code, setCode] = useState(course.join_code);
  const [shown, setShown] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <li className="py-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span><b>{course.code}</b> {course.title} <span className="text-text-faint">· {course.members} members</span></span>
        <span className="flex items-center gap-2">
          Join code: <code>{shown ? code : "••••-•••"}</code>
          <button type="button" className="btn" onClick={() => setShown((s) => !s)}>{shown ? "Hide" : "Show"}</button>
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() => {
              if (!confirm("Rotate the join code? The old code stops working immediately.")) return;
              start(async () => {
                const r = await regenerateJoinCode(course.id);
                if (r.value) { setCode(r.value); setShown(true); }
                setMsg(r.message ?? null);
              });
            }}
          >
            Rotate
          </button>
        </span>
      </div>
      <form className="flex flex-wrap items-end gap-3 text-sm" action={(fd) => start(async () => setMsg((await saveCourseBasics(course.id, fd)).message ?? null))}>
        <label className="grid gap-1"><span className="label m-0">Term</span><input className="input" style={{ width: "9rem" }} name="term" defaultValue={course.term ?? ""} /></label>
        <label className="grid gap-1"><span className="label m-0">Seconds per station</span><input className="input" style={{ width: "7rem" }} type="number" name="station_seconds" min={10} max={600} defaultValue={course.station_seconds} /></label>
        <label className="grid gap-1">
          <span className="label m-0">Exam spelling</span>
          <select className="input" style={{ width: "auto" }} name="exam_spelling" defaultValue={course.exam_spelling}>
            <option value="generous">generous</option>
            <option value="strict">strict</option>
          </select>
        </label>
        <button className="btn btn-primary" type="submit" disabled={pending}>Save</button>
        {msg && <span className="text-text-dim" role="status">{msg}</span>}
      </form>
    </li>
  );
}

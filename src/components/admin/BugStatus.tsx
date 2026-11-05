"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBugStatus } from "@/app/admin/actions";

export function BugStatus({ id, status, note: initial }: { id: string; status: string; note: string }) {
  const router = useRouter();
  const [note, setNote] = useState(initial);
  const [pending, start] = useTransition();
  const set = (s: "open" | "fixed" | "dismissed") => start(async () => { await setBugStatus(id, s, note); router.refresh(); });
  return (
    <div className="flex flex-wrap items-center gap-2 pt-2">
      <input className="input" style={{ width: "18rem" }} placeholder="Resolution note" aria-label="Resolution note" value={note} onChange={(e) => setNote(e.target.value)} />
      {(["open", "fixed", "dismissed"] as const).map((s) => (
        <button key={s} type="button" className={`btn ${status === s ? "btn-primary" : ""}`} disabled={pending} onClick={() => set(s)}>{s}</button>
      ))}
    </div>
  );
}

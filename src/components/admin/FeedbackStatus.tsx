"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setFeedbackStatus } from "@/app/admin/actions";

export function FeedbackStatus({ id, status, note: initial }: { id: string; status: string; note: string }) {
  const router = useRouter();
  const [note, setNote] = useState(initial);
  const [pending, start] = useTransition();
  const set = (s: "new" | "seen" | "resolved") => start(async () => { await setFeedbackStatus(id, s, note); router.refresh(); });
  return (
    <div className="flex flex-wrap items-center gap-2 pt-2">
      <input className="input" style={{ width: "18rem" }} placeholder="Note (private)" aria-label="Admin note" value={note} onChange={(e) => setNote(e.target.value)} />
      {(["new", "seen", "resolved"] as const).map((s) => (
        <button key={s} type="button" className={`btn ${status === s ? "btn-primary" : ""}`} disabled={pending} onClick={() => set(s)}>{s}</button>
      ))}
    </div>
  );
}

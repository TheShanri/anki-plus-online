"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveFlag } from "@/app/admin/actions";

export function ResolveButton({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <input className="input" style={{ width: "16rem" }} placeholder="What was changed? (optional)" aria-label="Resolution note" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn" type="button" disabled={pending} onClick={() => start(async () => { await resolveFlag(reviewId, note); router.refresh(); })}>Mark resolved</button>
    </div>
  );
}

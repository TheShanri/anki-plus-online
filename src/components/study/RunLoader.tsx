"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { StudyPayload } from "@/lib/study/types";
import { StudyRunner } from "./StudyRunner";

/** Fetches the first batch (with the browser's timezone for "today") and starts the session. */
export function RunLoader({ scope, limit, course }: { scope: string; limit?: number; course?: string }) {
  const [payload, setPayload] = useState<StudyPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tz] = useState(() => (typeof window === "undefined" ? 0 : new Date().getTimezoneOffset()));
  useEffect(() => {
    let live = true;
    const q = new URLSearchParams({ scope, tz: String(new Date().getTimezoneOffset()), bootstrap: "1" });
    if (course) q.set("course", course);
    fetch(`/api/study/queue?${q}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Could not load your cards");
        if (live) setPayload(j as StudyPayload);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [scope, course]);
  if (error) return <div className="panel"><p className="field-error">{error}</p><Link className="btn" href="/study">Back</Link></div>;
  if (!payload) return <div className="panel"><p className="text-text-dim">Loading your cards…</p></div>;
  return <StudyRunner initial={payload} scope={scope} limit={limit} tz={tz} />;
}

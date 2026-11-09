"use client";
// Mock lab practical: fixed time per station, auto-advance, no going back, no feedback. Answers are graded
// on the server at the end (generous spelling per the course setting).
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Flag, Play, RotateCcw } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import type { StudyCard } from "@/lib/study/types";
import { CardFace } from "@/components/cards/CardFace";
import { PinImage } from "@/components/cards/PinImage";
import { emit } from "@/lib/feedback/events";
import { stationSeconds } from "@/lib/study/practical";
import "./study.css";

interface Station {
  pin: StudyCard;
  followups: StudyCard[];
}
interface Started {
  attemptId: string;
  seconds: number;
  course: { id: string; slug: string };
  stations: Station[];
}

export interface UnitOption {
  slug: string;
  title: string;
  pins: number;
}

export function PracticalSetup({ units, defaultSeconds }: { units: UnitOption[]; defaultSeconds: number }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [count, setCount] = useState(15);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [run, setRun] = useState<Started | null>(null);
  const available = (picked.length ? units.filter((u) => picked.includes(u.slug)) : units).reduce((s, u) => s + u.pins, 0);

  const start = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/practical/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ units: picked, count }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not start");
      setRun(j as Started);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (run) return <PracticalRun started={run} />;
  return (
    <div className="panel" style={{ maxWidth: 640, display: "grid", gap: 14 }}>
      <p className="text-text-dim">
        A timed lab practical: each station shows a pin on a photo. Type the name (and answer its follow-up). {defaultSeconds} seconds for the pin, plus about {Math.round(defaultSeconds * 0.6)} for each follow-up, no going back, no feedback until the end.
      </p>
      <div>
        <p className="label">Units</p>
        <div className="btn-row">
          {units.map((u) => (
            <label key={u.slug} className="chip-check">
              <input type="checkbox" checked={picked.includes(u.slug)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, u.slug] : p.filter((x) => x !== u.slug)))} />
              <Check aria-hidden />
              {u.title} <span className="chip-n">{u.pins}</span>
            </label>
          ))}
          {units.length === 0 && <span className="text-text-dim">No pin cards yet.</span>}
        </div>
        <p className="text-text-faint" style={{ fontSize: 12, marginTop: 4 }}>{picked.length ? "Selected units only." : "Nothing selected: the whole course."}</p>
      </div>
      <Field label="Stations" className="max-w-[260px]" hint={`About ${Math.round((Math.min(count, available) * defaultSeconds * 1.5) / 60)} minutes (follow-ups add time). ${available} pin cards available.`}>
        <Input type="number" min={1} max={Math.max(1, Math.min(100, available))} value={count} style={{ maxWidth: 120 }} onChange={(e) => setCount(Number(e.target.value))} />
      </Field>
      {err && <p className="field-error">{err}</p>}
      <div className="btn-row"><Button variant="primary" size="lg" icon={Play} loading={busy} disabled={available === 0} onClick={() => void start()}>{busy ? "Preparing" : "Start practical"}</Button></div>
    </div>
  );
}

function PracticalRun({ started }: { started: Started }) {
  const router = useRouter();
  const { stations, seconds, attemptId, course } = started;
  const [idx, setIdx] = useState(0);
  const secsOf = (i: number) => stationSeconds(seconds, stations[i]?.followups.length ?? 0);
  const [left, setLeft] = useState(secsOf(0));
  const [typed, setTyped] = useState<string[]>([""]);
  const answers = useRef<Array<{ cardId: string; typed: string; followups: string[]; timedOut?: boolean }>>([]);
  const cur = useRef({ typed: "", fu: [] as string[] });
  const startedAt = useRef(0);
  const activeMs = useRef(0);
  const [finishing, setFinishing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const station = stations[idx];
  const fields = station ? 1 + station.followups.length : 0;

  const finish = useCallback(async () => {
    setFinishing(true);
    emit("practical_end", {});
    try {
      const r = await fetch("/api/practical/finish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attemptId, answers: answers.current, activeMs: Math.min(Date.now() - startedAt.current, 3 * 3_600_000) }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not score");
      router.push(`/practical/results/${j.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setFinishing(false);
    }
  }, [attemptId, router]);

  const advance = useCallback(
    (timedOut: boolean) => {
      const s = stations[idx];
      answers.current.push({ cardId: s.pin.id, typed: cur.current.typed, followups: s.followups.map((_, i) => cur.current.fu[i] ?? ""), timedOut });
      activeMs.current = Date.now() - startedAt.current;
      cur.current = { typed: "", fu: [] };
      if (idx + 1 >= stations.length) void finish();
      else {
        setIdx(idx + 1);
        setLeft(secsOf(idx + 1));
        setTyped(new Array(1 + stations[idx + 1].followups.length).fill(""));
      }
    },
    [idx, stations, seconds, finish],
  );

  useEffect(() => {
    startedAt.current = Date.now();
    emit("practical_start", { stations: stations.length });
  }, [stations.length]);

  // one deadline per station: robust against throttled background timers
  useEffect(() => {
    if (finishing || !station) return;
    const deadline = Date.now() + secsOf(idx) * 1000;
    const iv = window.setInterval(() => {
      const l = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setLeft(l);
      if (l <= 10) emit("practical_tick", { seconds: l });
      if (l <= 0) {
        window.clearInterval(iv);
        advance(true);
      }
    }, 250);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, finishing]);

  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstRef.current?.focus();
  }, [idx]);

  if (finishing || !station) {
    return <div className="panel"><p className="text-text-dim">{err ?? "Scoring your practical…"}</p>{err && <Button icon={RotateCcw} onClick={() => void finish()} style={{ marginTop: 12 }}>Try again</Button>}</div>;
  }
  const set = (i: number, v: string) => {
    setTyped((t) => t.map((x, k) => (k === i ? v : x)));
    if (i === 0) cur.current.typed = v;
    else cur.current.fu[i - 1] = v;
  };
  const submit = () => advance(false);
  return (
    <div className={`st-wrap${station.pin.image ? " wide" : ""}`}>
      <div className="st-top">
        <span className="chip">Station {idx + 1} of {stations.length}</span>
        <div className="prac-bar" style={{ flex: 1 }} aria-hidden><i style={{ width: "100%", transform: `scaleX(${left / secsOf(idx)})`, transformOrigin: "left" }} /></div>
        <span className={`prac-timer${left <= 10 ? " low" : ""}`} aria-label="Seconds left">{left}</span>
      </div>
      <div className={`panel${station.pin.image ? " st-split" : ""}`}>
        {station.pin.image && (
          <div className="st-media">
            <PinImage courseSlug={course.slug} image={station.pin.image} mode="prompt" alt={station.pin.prompt || "Station image"} />
          </div>
        )}
        <div className="st-main">
        <CardFace card={station.pin} courseSlug={course.slug} hideImage />
        <form
          style={{ display: "grid", gap: 10, marginTop: 14 }}
          onSubmit={(e) => {
            e.preventDefault();
            const inputs = Array.from(e.currentTarget.querySelectorAll<HTMLInputElement>(".prac-input"));
            const at = inputs.indexOf(document.activeElement as HTMLInputElement);
            if (at >= 0 && at < inputs.length - 1) inputs[at + 1].focus();
            else submit();
          }}
        >
          <input ref={firstRef} className="prac-input" aria-label="Your answer" autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false} value={typed[0] ?? ""} onChange={(e) => set(0, e.target.value)} placeholder="Your answer" />
          {station.followups.map((f, i) => (
            <div key={f.id}>
              <p className="card-prompt" style={{ fontSize: 16, marginBottom: 6 }}>{f.prompt}</p>
              <input className="prac-input" aria-label={f.prompt} autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false} value={typed[i + 1] ?? ""} onChange={(e) => set(i + 1, e.target.value)} />
            </div>
          ))}
          <div className="btn-row">
            <Button type="submit" variant="primary" icon={idx + 1 >= stations.length ? Flag : undefined} iconRight={idx + 1 >= stations.length ? undefined : ArrowRight}>{idx + 1 >= stations.length ? "Finish" : "Next station"}</Button>
            <span className="v-notes">{fields > 1 ? "Enter moves on. " : "Enter moves on. "}You cannot go back.</span>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { appState, captureAfter, installLogger, logRoute, snapshotLogs } from "@/lib/bugs/logger";

// Start recording as early as this module loads (before React effects run).
if (typeof window !== "undefined") installLogger();

const AFTER_MS = 60_000;

const TYPES = [
  { id: "bug", label: "Bug", hint: "Something is broken or confusing." },
  { id: "card", label: "Mistake in a card", hint: "A wrong answer, typo or unclear question." },
  { id: "idea", label: "Idea", hint: "Something that would make studying better." },
  { id: "praise", label: "Praise", hint: "Something that works well." },
  { id: "other", label: "Other", hint: "Anything else." },
] as const;
type FbType = (typeof TYPES)[number]["id"];

async function takeScreenshot(): Promise<string | null> {
  try {
    const { domToJpeg } = await import("modern-screenshot");
    const scale = Math.min(1, 1100 / window.innerWidth);
    const run = domToJpeg(document.body, {
      scale,
      quality: 0.55,
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      style: { transform: `translate(${-window.scrollX}px, ${-window.scrollY}px)`, transformOrigin: "top left" },
      filter: (n) => !(n instanceof Element && n.hasAttribute("data-bug-ignore")),
    });
    const url = await Promise.race([run, new Promise<null>((r) => setTimeout(() => r(null), 8000))]);
    return url && url.length < 2_000_000 ? url : null;
  } catch {
    return null;
  }
}

function currentCard(): { id: string; slug: string } | null {
  try {
    const c = (window as unknown as { __ankiEngine?: { cur?: { card?: { id?: string; slug?: string } } } }).__ankiEngine?.cur?.card;
    return c?.id ? { id: String(c.id), slug: String(c.slug ?? "") } : null;
  } catch {
    return null;
  }
}

type Phase = "idle" | "open" | "sending" | "done";

export function FeedbackWidget() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const [type, setType] = useState<FbType>("bug");
  const [text, setText] = useState("");
  const [attach, setAttach] = useState(true);
  const [card, setCard] = useState<{ id: string; slug: string } | null>(null);
  const [note, setNote] = useState("");
  const [failed, setFailed] = useState(false);
  const shot = useRef<Promise<string | null> | null>(null);
  const after = useRef<{ id: string; token: string; stop: () => ReturnType<ReturnType<typeof captureAfter>["stop"]>; timer: number } | null>(null);
  const first = useRef(true);

  const finishAfter = useCallback((beacon = false) => {
    const a = after.current;
    if (!a) return;
    after.current = null;
    window.clearTimeout(a.timer);
    const payload = JSON.stringify({ id: a.id, token: a.token, logsAfter: a.stop() });
    if (beacon && navigator.sendBeacon) navigator.sendBeacon("/api/feedback/append", new Blob([payload], { type: "text/plain" }));
    else fetch("/api/feedback/append", { method: "POST", body: payload, keepalive: true }).catch(() => null);
  }, []);

  useEffect(() => {
    logRoute(pathname);
    if (first.current) first.current = false;
    else finishAfter();
  }, [pathname, finishAfter]);

  useEffect(() => {
    const onHide = () => finishAfter(true);
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [finishAfter]);

  const start = useCallback((t: FbType = "bug") => {
    if (phase !== "idle") return;
    shot.current = takeScreenshot(); // silent: rendered from the DOM before the dialog appears
    const c = currentCard();
    setCard(c);
    setType(t === "bug" && !c ? "bug" : t);
    setAttach(t === "bug");
    setText("");
    setFailed(false);
    setPhase("open");
  }, [phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && e.code === "KeyB") { e.preventDefault(); start("bug"); }
      if (e.altKey && e.shiftKey && e.code === "KeyF") { e.preventDefault(); start(currentCard() ? "card" : "idea"); }
      if (e.key === "Escape" && phase === "open") setPhase("idle");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [start, phase]);

  function pick(t: FbType) {
    setType(t);
    setAttach(t === "bug");
  }

  async function send() {
    setPhase("sending");
    const screenshot = attach ? await shot.current : null;
    const cap = captureAfter();
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type,
          message: text.trim(),
          route: location.pathname + location.search,
          cardId: card?.id,
          cardSlug: card?.slug,
          userAgent: navigator.userAgent,
          appState: appState(),
          logsBefore: attach ? snapshotLogs() : [],
          screenshot,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const { id, token, emailed } = (await res.json()) as { id: string; token: string; emailed?: boolean };
      if (attach) {
        const timer = window.setTimeout(() => finishAfter(), AFTER_MS);
        after.current = { id, token, stop: cap.stop, timer };
      } else cap.stop();
      setNote(emailed ? "Thanks! We got it. A copy is in your inbox." : "Thanks! We got it.");
      setFailed(false);
    } catch {
      cap.stop();
      setNote("It could not be sent. Please try again in a moment.");
      setFailed(true);
    }
    setPhase("done");
    window.setTimeout(() => setPhase((p) => (p === "done" ? "idle" : p)), failed ? 6000 : 7000);
  }

  const current = TYPES.find((t) => t.id === type)!;

  return (
    <div data-bug-ignore>
      {phase === "idle" && (
        <button
          type="button"
          onClick={() => start("bug")}
          aria-label="Send feedback (Alt+Shift+B)"
          title="Send feedback: bug, idea, mistake in a card (Alt+Shift+B)"
          className="fixed bottom-3 left-3 z-40 rounded-full border border-panel-border bg-panel-solid px-3 py-1 text-xs text-text-dim shadow-sm transition-opacity hover:text-text focus-visible:opacity-100"
        >
          Feedback
        </button>
      )}
      {phase === "done" && (
        <p role="status" className="panel fixed bottom-3 left-3 z-40 max-w-xs text-sm">{note}</p>
      )}
      {(phase === "open" || phase === "sending") && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="fb-title">
          <form
            className="panel w-full max-w-md space-y-3"
            style={{ background: "var(--panel-solid)" }}
            onSubmit={(e) => { e.preventDefault(); void send(); }}
          >
            <h2 id="fb-title" className="font-display text-lg">Send feedback</h2>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Type of feedback">
              {TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={type === t.id}
                  className={`btn ${type === t.id ? "btn-primary" : ""}`}
                  style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem" }}
                  onClick={() => pick(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="text-sm text-text-dim">{current.hint}</p>
            <textarea
              className="input"
              style={{ minHeight: "5.5rem", resize: "vertical" }}
              autoFocus
              maxLength={2000}
              placeholder={type === "bug" ? "What went wrong? (optional)" : "Your message"}
              aria-label="Your message"
              value={text}
              onChange={(e) => setText(e.target.value)}
              required={type !== "bug"}
            />
            <p className="text-xs text-text-faint">
              We attach the page ({location.pathname}){card?.slug ? ` and the card you are on (${card.slug})` : ""}.
            </p>
            <label className="flex items-start gap-2 text-xs text-text-dim">
              <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} className="mt-0.5" />
              <span>Include a screenshot of this page and a short technical log (no passwords).</span>
            </label>
            <div className="flex items-center justify-between gap-2">
              <a href="/about#feedback" className="text-xs text-text-faint underline-offset-2 hover:underline">How feedback is used</a>
              <span className="flex gap-2">
                <button type="button" className="btn" onClick={() => setPhase("idle")} disabled={phase === "sending"}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={phase === "sending"}>{phase === "sending" ? "Sending..." : "Send"}</button>
              </span>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

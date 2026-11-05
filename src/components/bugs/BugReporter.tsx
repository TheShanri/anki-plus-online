"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { appState, captureAfter, installLogger, logRoute, snapshotLogs } from "@/lib/bugs/logger";

// Start recording as early as this module loads (before React effects run).
if (typeof window !== "undefined") installLogger();

const AFTER_MS = 60_000;

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

type Phase = "idle" | "open" | "sending" | "done";

export function BugReporter() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const shot = useRef<Promise<string | null> | null>(null);
  const after = useRef<{ id: string; token: string; stop: () => ReturnType<ReturnType<typeof captureAfter>["stop"]>; timer: number } | null>(null);
  const first = useRef(true);

  const finishAfter = useCallback((beacon = false) => {
    const a = after.current;
    if (!a) return;
    after.current = null;
    window.clearTimeout(a.timer);
    const payload = JSON.stringify({ token: a.token, logsAfter: a.stop() });
    if (beacon && navigator.sendBeacon) navigator.sendBeacon(`/api/bugs/${a.id}`, new Blob([payload], { type: "text/plain" }));
    else fetch(`/api/bugs/${a.id}`, { method: "PATCH", body: payload, keepalive: true }).catch(() => null);
  }, []);

  // Route changes are logged, and end the "after" capture early.
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

  const start = useCallback(() => {
    if (phase !== "idle") return;
    shot.current = takeScreenshot(); // silent: rendered from the DOM before the dialog appears
    setText("");
    setPhase("open");
  }, [phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && e.code === "KeyB") { e.preventDefault(); start(); }
      if (e.key === "Escape" && phase === "open") setPhase("idle");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [start, phase]);

  async function send() {
    setPhase("sending");
    const screenshot = await shot.current;
    const cap = captureAfter();
    try {
      const res = await fetch("/api/bugs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          route: location.pathname,
          description: text.trim(),
          userAgent: navigator.userAgent,
          appState: appState(),
          logsBefore: snapshotLogs(),
          screenshot,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const { id, token } = (await res.json()) as { id: string; token: string };
      const timer = window.setTimeout(() => finishAfter(), AFTER_MS);
      after.current = { id, token, stop: cap.stop, timer };
      setNote("Thank you. Your report was sent.");
    } catch {
      cap.stop();
      setNote("The report could not be sent. Please try again in a moment.");
    }
    setPhase("done");
    window.setTimeout(() => setPhase("idle"), 4000);
  }

  return (
    <div data-bug-ignore>
      {phase === "idle" && (
        <button
          type="button"
          onClick={start}
          aria-label="Report a bug (Alt+Shift+B)"
          title="Report a bug (Alt+Shift+B)"
          className="fixed bottom-3 left-3 z-40 rounded-full border border-panel-border bg-panel-solid px-3 py-1 text-xs text-text-faint opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100"
        >
          Report a bug
        </button>
      )}
      {phase === "done" && (
        <p role="status" className="panel fixed bottom-3 left-3 z-40 max-w-xs text-sm">{note}</p>
      )}
      {(phase === "open" || phase === "sending") && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="bug-title">
          <form
            className="panel w-full max-w-md space-y-3"
            style={{ background: "var(--panel-solid)" }}
            onSubmit={(e) => { e.preventDefault(); void send(); }}
          >
            <h2 id="bug-title" className="font-display text-lg">Report a bug</h2>
            <p className="text-sm text-text-dim">
              A screenshot of this page and a short technical log (no passwords) are attached. Anything you can add in a line helps.
            </p>
            <input
              className="input"
              autoFocus
              maxLength={300}
              placeholder="What went wrong? (optional)"
              aria-label="What went wrong?"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setPhase("idle")} disabled={phase === "sending"}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={phase === "sending"}>{phase === "sending" ? "Sending..." : "Send"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

"use client";
// Background answer sync. Answers are sent strictly in order (the server's FSRS state depends on order), retried
// with backoff on network/server errors, kept in localStorage so a closed tab or a dead connection loses nothing
// (the server is idempotent on clientId), and flushed with sendBeacon on pagehide.
import type { AnswerPayload, UndoPayload } from "./engine.ts";

type Item = AnswerPayload | UndoPayload;
const isUndo = (x: Item): x is UndoPayload => (x as UndoPayload).undo === true;

const KEY = "anki.pendingAnswers.v1";
const URL_ANSWER = "/api/study/answer";
const URL_UNDO = "/api/study/undo";

function load(): Item[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Item[]) : [];
  } catch {
    return [];
  }
}
function save(q: Item[]): void {
  try {
    if (q.length) window.localStorage.setItem(KEY, JSON.stringify(q));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: in-memory only */
  }
}

export class AnswerSync {
  private queue: Item[] = [];
  private running = false;
  private fails = 0;
  private onStatus: (s: { pending: number; error: string | null }) => void = () => {};
  setListener(fn: (s: { pending: number; error: string | null }) => void): void {
    this.onStatus = fn;
  }
  /** the course's sessionId may differ from a stored one: stored answers carry their own */
  constructor() {
    this.queue = load();
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", () => this.beacon());
      window.addEventListener("online", () => void this.pump());
    }
    if (this.queue.length) void this.pump();
  }

  get pending(): number {
    return this.queue.length;
  }

  send(p: AnswerPayload): void {
    this.queue.push(p);
    save(this.queue);
    this.onStatus({ pending: this.queue.length, error: null });
    void this.pump();
  }

  /** Take back an answer: if it has not left the browser yet it is simply dropped; otherwise the undo follows it. */
  undo(u: UndoPayload): void {
    const i = this.queue.findIndex((x) => !isUndo(x) && x.clientId === u.clientId);
    if (i >= 0 && !(i === 0 && this.running)) {
      this.queue.splice(i, 1);
      save(this.queue);
      this.onStatus({ pending: this.queue.length, error: null });
      return;
    }
    this.queue.push(u);
    save(this.queue);
    this.onStatus({ pending: this.queue.length, error: null });
    void this.pump();
  }

  /** Resolves once everything queued so far is stored (or gives up after `ms`). */
  async drain(ms = 4000): Promise<void> {
    const end = Date.now() + ms;
    while (this.queue.length && Date.now() < end) await new Promise((r) => setTimeout(r, 100));
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const head = this.queue[0];
        let res: Response | null = null;
        try {
          res = await fetch(isUndo(head) ? URL_UNDO : URL_ANSWER, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(head), keepalive: true });
        } catch {
          res = null;
        }
        if (res && res.ok) {
          this.queue.shift();
          this.fails = 0;
          save(this.queue);
          this.onStatus({ pending: this.queue.length, error: null });
          continue;
        }
        // a rejected answer (400/404) will never succeed: drop it so it cannot block the rest
        if (res && res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 408 && res.status !== 429) {
          this.queue.shift();
          save(this.queue);
          this.onStatus({ pending: this.queue.length, error: "An answer could not be saved." });
          continue;
        }
        this.fails++;
        this.onStatus({ pending: this.queue.length, error: res && res.status === 401 ? "Signed out: log in again to save your answers." : "Offline: answers will be saved when the connection returns." });
        await new Promise((r) => setTimeout(r, Math.min(30_000, 1000 * 2 ** Math.min(this.fails, 5))));
      }
    } finally {
      this.running = false;
    }
  }

  private beacon(): void {
    if (!this.queue.length || !("sendBeacon" in navigator)) return;
    for (const p of this.queue.slice(0, 10)) navigator.sendBeacon(isUndo(p) ? URL_UNDO : URL_ANSWER, new Blob([JSON.stringify(p)], { type: "text/plain" }));
  }
}

// Client-side log ring buffer for "Report a bug". Browser only. Started early from the root layout.
// Records: console output, uncaught errors, unhandled rejections, failed fetches, route changes and
// breadcrumbs. Never records input values or passwords (clicks record only a button/link label).

export type LogKind = "console" | "error" | "rejection" | "fetch" | "route" | "crumb" | "click";
export type LogEntry = { t: number; k: LogKind; m: string; d?: unknown };

const MAX_ENTRIES = 500;
const MAX_AGE_MS = 5 * 60 * 1000;
const MAX_STR = 600;

type Listener = (e: LogEntry) => void;
type Store = { buf: LogEntry[]; listeners: Set<Listener>; state: Record<string, unknown>; installed: boolean };

function store(): Store {
  const w = window as unknown as { __bugStore?: Store };
  return (w.__bugStore ??= { buf: [], listeners: new Set(), state: {}, installed: false });
}

function redact(s: string): string {
  return s
    .replace(/("?(?:password|passwd|pwd|token|access_token|refresh_token|apikey|api_key|secret)"?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,&}]+)/gi, "$1[redacted]")
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[jwt]");
}

function str(v: unknown): string {
  try {
    if (typeof v === "string") return redact(v).slice(0, MAX_STR);
    if (v instanceof Error) return redact(`${v.name}: ${v.message}\n${v.stack ?? ""}`).slice(0, MAX_STR * 2);
    if (typeof v === "function") return "[function]";
    if (v instanceof Element) return `<${v.tagName.toLowerCase()}>`;
    return redact(JSON.stringify(v) ?? String(v)).slice(0, MAX_STR);
  } catch {
    return "[unserialisable]";
  }
}

function push(k: LogKind, m: string, d?: unknown) {
  const s = store();
  const e: LogEntry = { t: Date.now(), k, m: m.slice(0, MAX_STR * 2) };
  if (d !== undefined) e.d = d;
  s.buf.push(e);
  const cutoff = e.t - MAX_AGE_MS;
  while (s.buf.length > MAX_ENTRIES || (s.buf.length && s.buf[0].t < cutoff)) s.buf.shift();
  s.listeners.forEach((fn) => fn(e));
}

/** Breadcrumb for key user actions (card shown, answer submitted, setting toggled). Never pass typed free text. */
export function crumb(message: string, data?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  push("crumb", message, data);
}

/** Merge app state shown with every report (card id, mode, ...). Pass null to remove a key. */
export function setBugState(partial: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const s = store();
  for (const [k, v] of Object.entries(partial)) {
    if (v === null) delete s.state[k];
    else s.state[k] = v;
  }
}

export function logRoute(path: string) {
  if (typeof window === "undefined") return;
  push("route", path);
  setBugState({ route: path });
}

export function snapshotLogs(): LogEntry[] {
  return [...store().buf];
}

export function appState(): Record<string, unknown> {
  const nav = navigator;
  return {
    ...store().state,
    route: location.pathname + location.search.replace(/(token|code)=[^&]*/g, "$1=[redacted]"),
    theme: document.documentElement.dataset.theme ?? null,
    viewport: `${innerWidth}x${innerHeight}@${devicePixelRatio}`,
    language: nav.language,
    online: nav.onLine,
    userAgent: nav.userAgent,
  };
}

/** Collects entries from now on; call stop() to get them. */
export function captureAfter(): { stop: () => LogEntry[] } {
  const got: LogEntry[] = [];
  const fn: Listener = (e) => { if (got.length < MAX_ENTRIES) got.push(e); };
  store().listeners.add(fn);
  return { stop: () => { store().listeners.delete(fn); return got; } };
}

export function installLogger() {
  if (typeof window === "undefined") return;
  const s = store();
  if (s.installed) return;
  s.installed = true;

  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      try { push("console", `${level}: ${args.map(str).join(" ")}`); } catch { /* never break the console */ }
      orig(...args);
    };
  }

  window.addEventListener("error", (ev) => {
    const where = ev.filename ? ` (${ev.filename.split("/").pop()}:${ev.lineno}:${ev.colno})` : "";
    push("error", `${ev.message}${where}`, ev.error instanceof Error ? str(ev.error.stack) : undefined);
  });
  window.addEventListener("unhandledrejection", (ev) => push("rejection", str(ev.reason)));

  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const started = performance.now();
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    let url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    try {
      const u = new URL(url, location.href);
      u.searchParams.forEach((_, k) => { if (/token|code|key|secret|password/i.test(k)) u.searchParams.set(k, "[redacted]"); });
      url = u.origin === location.origin ? u.pathname + u.search : `${u.origin}${u.pathname}`;
    } catch { /* keep as is */ }
    const quiet = url.startsWith("/api/bugs");
    try {
      const res = await origFetch(input, init);
      if (!res.ok && !quiet) push("fetch", `${method} ${url} -> ${res.status}`, { ms: Math.round(performance.now() - started) });
      return res;
    } catch (err) {
      if (!quiet) push("fetch", `${method} ${url} failed: ${str(err)}`, { ms: Math.round(performance.now() - started) });
      throw err;
    }
  };

  document.addEventListener(
    "click",
    (ev) => {
      const el = (ev.target as Element | null)?.closest?.("button, a, [role=button], summary");
      if (!el || el.closest("[data-bug-ignore]")) return;
      const label = (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 50);
      push("click", `${el.tagName.toLowerCase()}: ${label || "(no label)"}`);
    },
    true,
  );
}

// Client-side navigation test for the pathway tracer: does a router transition away from the page commit, and how fast?
//   node tools/pathways/v3/navtest.mjs --port 9381 --from "/atlas/pathways?v=3&p=dcml&limb=hand" --to /atlas/lesion,/study
//     [--pre "window.__pwGo(3)"] [--delay 600] [--play] [--click] [--timeout 45000] [--ready <js>]
// Needs a logged-in headless window from tools/ui/shot.mjs on the same port. For each target it reloads the start page,
// waits until the tracer is ready, runs --pre (a beat change), waits --delay ms (mid-beat), then navigates:
//   default  window.next.router.push(target): the client router transition the <Link> starts (no hard-navigation workaround);
//   --click  a real CDP mouse click on the AtlasModes / NavMenu link for the target (goes through the page's own onClick).
// It records every history.replaceState / pushState call and every React commit (DevTools hook) while the navigation is
// pending, and prints how long the new page took to commit (or that it never did within --timeout).
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const has = (n) => process.argv.includes(`--${n}`);
const port = Number(arg("port", 9381));
const base = arg("base", "http://localhost:3919");
const from = arg("from", "/atlas/pathways?v=3&p=dcml&limb=hand");
const tos = arg("to", "/atlas/lesion,/study").split(",");
const pre = arg("pre", "");
const delay = Number(arg("delay", 600));
const timeout = Number(arg("timeout", 45000));
const readyExpr = arg("ready", "!!(window.__pw3 && window.__pw3.ready)");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) {
    pending.get(d.id)(d);
    pending.delete(d.id);
  }
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

// instrumentation installed before any page script: React commits (DevTools hook) and history writes
const INSTRUMENT = `(() => {
  const log = (window.__navlog = []);
  const t0 = () => Math.round(performance.now());
  const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__ || (window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { renderers: new Map(), supportsFiber: true, inject(r) { const id = this.renderers.size + 1; this.renderers.set(id, r); return id; }, onScheduleFiberRoot() {}, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, checkDCE() {} });
  const prev = hook.onCommitFiberRoot;
  window.__commits = 0;
  window.__who = {};
  const nameOf = (f) => { const t = f.type; return !t ? null : typeof t === "string" ? null : t.displayName || t.name || (t.render && (t.render.displayName || t.render.name)) || null; };
  const walk = (f, depth) => { let n = 0; for (let c = f; c && n < 200000; c = c.sibling) { n++; if ((c.flags & 1) && c.alternate && (c.tag === 0 || c.tag === 11 || c.tag === 15) && c.memoizedState !== c.alternate.memoizedState) { let hs = c.memoizedState, ho = c.alternate.memoizedState, k = 0, which = []; while (hs && ho && k < 60) { if (hs.memoizedState !== ho.memoizedState && !(hs.queue === null && typeof hs.memoizedState === "object")) which.push(k); hs = hs.next; ho = ho.next; k++; } const nm = (nameOf(c) || "?") + "#" + which.slice(0, 6).join(","); window.__who[nm] = (window.__who[nm] || 0) + 1; } if (c.child) walk(c.child, depth + 1); } };
  hook.onCommitFiberRoot = function (id, root) { window.__commits++; if (window.__navWatch) { log.push({ t: t0(), k: "commit", r: id }); if (id === 1) try { walk(root.current.child, 0); } catch (e) {} } return prev && prev.apply(this, arguments); };
  const wrap = (name) => {
    const orig = history[name];
    Object.defineProperty(history, name, { configurable: true, get() { return this["__" + name] || orig; }, set(f) { this["__" + name] = function () { if (window.__navWatch) log.push({ t: t0(), k: name, url: String(arguments[2] || ""), na: !!(arguments[0] && arguments[0].__NA), stack: (new Error().stack || "").split("\\n").slice(2, 5).map((s) => s.trim()).join(" < ") }); return f.apply(this, arguments); }; } });
  };
  wrap("replaceState");
  wrap("pushState");
})();`;
await send("Page.enable");
await send("Runtime.enable");
await send("Page.addScriptToEvaluateOnNewDocument", { source: INSTRUMENT });

const results = [];
for (const to of tos) {
  await send("Page.navigate", { url: base + from });
  await sleep(1000);
  const t0 = Date.now();
  let ready = false;
  while (Date.now() - t0 < 90000) {
    ready = await ev(readyExpr);
    if (ready) break;
    await sleep(400);
  }
  if (pre) await ev(pre);
  if (has("play")) await ev(`window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }))`);
  await sleep(delay);
  const startPath = await ev("location.pathname");
  await ev(`window.__navWatch = true; window.__navlog.length = 0; window.__who = {}; window.__commits0 = window.__commits; true`);
  const tNav = Date.now();
  if (has("click")) {
    const box = await ev(`(() => { const a = [...document.querySelectorAll('a[href="${to}"]')].find((x) => x.offsetParent); if (!a) return null; a.scrollIntoView({ block: "center" }); const r = a.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    if (!box) {
      results.push({ to, error: "no visible link" });
      continue;
    }
    for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: box[0], y: box[1], button: "left", clickCount: 1 });
  } else await ev(`window.next.router.push(${JSON.stringify(to)}); true`);
  let committed = null;
  const toPath = to.split("?")[0];
  while (Date.now() - tNav < timeout) {
    const st = await ev(`JSON.stringify({ p: location.pathname, tracer: !!document.querySelector('[data-pw3-ready], canvas') && location.pathname.startsWith("/atlas/pathways"), cur: document.querySelector('[aria-current="page"]')?.getAttribute("href") || null })`).catch(() => null);
    const s = st ? JSON.parse(st) : null;
    if (s && s.p === toPath && !s.tracer) {
      committed = Date.now() - tNav;
      break;
    }
    await sleep(100);
  }
  const log = JSON.parse((await ev("JSON.stringify(window.__navlog || [])")) || "[]");
  const commits = await ev("window.__commits - window.__commits0");
  const byRoot = {};
  for (const e of log) if (e.k === "commit") byRoot[e.r] = (byRoot[e.r] || 0) + 1;
  const writes = log.filter((e) => e.k !== "commit");
  const r = { to, from: startPath, committedMs: committed, timedOut: committed === null, reactCommits: commits, commitsByRenderer: byRoot, historyWrites: writes.length, nonRouterWrites: writes.filter((w) => !w.na).length, firstWrites: writes.slice(0, 4), rendered: JSON.parse(await ev("JSON.stringify(Object.entries(window.__who).sort((a, b) => b[1] - a[1]).slice(0, 25))")) };
  results.push(r);
  console.log(JSON.stringify(r, null, 1));
}
ws.close();
process.exit(results.some((r) => r.timedOut || r.error) ? 1 : 0);

#!/usr/bin/env node
// Headless UI screenshots for ANKI PLUS Online, without ever showing a window or launching a browser.
// It reuses ANKI+'s WebView2 test harness: an off-screen, muted, never-focused window driven over CDP.
// (Headless Chrome/Edge get killed by Cold Turkey on this machine, and visible windows disturb the owner.)
//
//   node tools/ui/shot.mjs <url> <out.png> [--w 1280] [--h 800] [--wait 1500] [--eval "<js>"] [--port 9341]
//   node tools/ui/shot.mjs --stop [--port 9341]      close the headless window this script started
//
// The window stays open between calls (fast), so cookies persist: log in once with --eval on /login, then
// shoot protected pages. Each agent should use its own --port (and gets its own WebView2 profile).
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const argv = process.argv.slice(2);
const opt = (name, d) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : d; };
const PORT = Number(opt("port", 9341));
const PIDFILE = join(tmpdir(), `ankionline-shot-${PORT}.pid`);
const PY = "C:/Users/info/Desktop/ANKI PLUS/.venv/Scripts/pythonw.exe";
const DESKTOP = "C:/Users/info/Desktop/ANKI PLUS/app/desktop.py";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targets() {
  try { const r = await fetch(`http://127.0.0.1:${PORT}/json`); return r.ok ? await r.json() : null; } catch { return null; }
}

if (argv.includes("--stop")) {
  if (existsSync(PIDFILE)) {
    const pid = Number(readFileSync(PIDFILE, "utf8"));
    try { process.kill(pid); console.log("stopped", pid); } catch { console.log("not running"); }
    unlinkSync(PIDFILE);
  } else console.log("no window started by this script on port", PORT);
  process.exit(0);
}

const [url, out] = argv.filter((a, i) => !a.startsWith("--") && !(argv[i - 1] || "").startsWith("--"));
if (!url || !out) { console.error("usage: shot.mjs <url> <out.png> [--w --h --wait --eval --port]"); process.exit(1); }

let list = await targets();
if (!list) {
  const profile = join(tmpdir(), `ankionline-webview-${PORT}`);
  mkdirSync(profile, { recursive: true });
  const child = spawn(PY, [DESKTOP, url, "--title", "ANKI PLUS Online (test)"], {
    env: { ...process.env, ANKIPLUS_HEADLESS: "1", ANKIPLUS_DEBUG_PORT: String(PORT), ANKIPLUS_WEBVIEW_DIR: profile },
    detached: true, stdio: "ignore",
  });
  child.unref();
  writeFileSync(PIDFILE, String(child.pid));
  for (let i = 0; i < 60 && !(list = await targets()); i++) await sleep(500);
  if (!list) { console.error("headless window did not come up"); process.exit(1); }
}

let page = list.find((t) => t.type === "page");
for (let i = 0; i < 60 && !page; i++) { await sleep(500); page = ((await targets()) || []).find((t) => t.type === "page"); }
if (!page) { console.error("no page target in the headless window"); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const waiting = new Map(); const events = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); } else events.push(msg);
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

await send("Page.enable");
await send("Runtime.enable");
const w = Number(opt("w", 1280)), h = Number(opt("h", 800));
await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
events.length = 0;
await send("Page.navigate", { url });
for (let i = 0; i < 100 && !events.some((e) => e.method === "Page.loadEventFired"); i++) await sleep(100);
await sleep(Number(opt("wait", 1500)));
const js = opt("eval");
if (js) {
  const r = await send("Runtime.evaluate", { expression: js, awaitPromise: true, returnByValue: true });
  console.log("eval:", JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails?.text ?? null));
  await sleep(Number(opt("wait", 1500)));
}
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(shot.result.data, "base64"));
const errs = events.filter((e) => e.method === "Runtime.exceptionThrown").map((e) => e.params.exceptionDetails?.exception?.description || e.params.exceptionDetails?.text);
console.log(`saved ${out} (${w}x${h})${errs.length ? `\npage errors:\n${errs.join("\n")}` : ""}`);
ws.close();
process.exit(0);

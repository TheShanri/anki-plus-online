// Per-beat screenshots of the v3 tracer, for the contact sheets (tools/pathways/v3/sheet.py):
//   node tools/pathways/v3/shoot.mjs --port 9381 --only dcml:hand,visual [--sizes 1440x900,390x844] [--out _atlas/pw3_shots] [--beats 0,3,6]
//   [--side both|L|R] [--extra lateral-cord]   (needs a logged-in headless window from tools/ui/shot.mjs on the same port)
// Each beat is reached by window.__pwGo (no reload) and captured after its draw (2.4 s). Files: <out>/<slug>/<WxH>/beatNN.png
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const port = Number(arg("port", 9381));
const base = arg("base", "http://localhost:3919");
const out = arg("out", "_atlas/pw3_shots");
const only = (arg("only", "") || "").split(",").filter(Boolean);
const sizes = (arg("sizes", "1440x900") || "").split(",").map((s) => s.split("x").map(Number));
const beatsWanted = arg("beats", "") ? arg("beats", "").split(",").map(Number) : null;
const side = arg("side", "both");
const wait = Number(arg("wait", 2600));
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
const waitFor = async (expr, ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await ev(expr)) return true;
    await sleep(400);
  }
  return false;
};
await send("Page.enable");
const report = [];
for (const [W, H] of sizes) {
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: W < 700 });
  for (const key of only) {
    const [slug, limb] = key.split(":");
    const url = `${base}/atlas/pathways?v=3&p=${slug}&side=${side}&step=0${limb ? `&limb=${limb}` : ""}`;
    const t0 = Date.now();
    await send("Page.navigate", { url });
    await sleep(800);
    const ok = await waitFor(`!!(window.__pw3 && window.__pw3.ready && window.__pw3.slug === ${JSON.stringify(slug)})`, 90000);
    const loadMs = Date.now() - t0;
    if (!ok) {
      report.push({ key, size: `${W}x${H}`, ok: false, loadMs });
      console.log(JSON.stringify(report[report.length - 1]));
      continue;
    }
    const B = await ev("window.__pw3.B");
    const dir = join(out, slug + (limb ? `-${limb}` : ""), `${W}x${H}`);
    mkdirSync(dir, { recursive: true });
    for (let b = 0; b < B; b++) {
      if (beatsWanted && !beatsWanted.includes(b)) continue;
      await ev(`window.__pwGo(${b})`);
      await sleep(wait);
      const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      if (r.result?.data) writeFileSync(join(dir, `beat${String(b).padStart(2, "0")}.png`), Buffer.from(r.result.data, "base64"));
    }
    report.push({ key, size: `${W}x${H}`, ok: true, beats: B, loadMs });
    console.log(JSON.stringify(report[report.length - 1]));
  }
}
await send("Emulation.clearDeviceMetricsOverride");
ws.close();
process.exit(0);

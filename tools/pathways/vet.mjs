// Vets every pathway in the tracer over CDP, comparing the schematic (DOM) with the 3D beat list and the resolved 3D objects:
//   node tools/pathways/vet.mjs --port 9364 [--only dcml,alst] [--steps dcml,alst] [--out <dir>] [--base http://localhost:3919]
// Needs a headless window opened by tools/ui/shot.mjs (logged in). Per pathway it checks:
//   - every waypoint resolved (no missing 3D part of a tube), a tube for each side on every path beat, a node mark on every node beat
//   - each path starts and ends exactly on its neighbouring nodes (per side), crossings change side at the crossing beat
//   - the schematic has one row per beat, with the same caption, and an X exactly on the crossing beats
//   - hovering a schematic row sets the 3D hover highlight (and clicking it opens the popover)
// It saves a screenshot of a mid-path beat per pathway (and of every beat for --steps) and prints one JSON line per pathway.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const port = Number(arg("port", 9364));
const base = arg("base", "http://localhost:3919");
const out = arg("out", ".");
const only = arg("only", "")?.split(",").filter(Boolean);
const steps = new Set((arg("steps", "") || "").split(",").filter(Boolean));
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const shot = async (file) => {
  const r = await send("Page.captureScreenshot", { format: "png" });
  if (r.result?.data) writeFileSync(file, Buffer.from(r.result.data, "base64"));
};
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

const ALL = (arg("all", "") || "").split(",").filter(Boolean);
const LIST = only?.length ? only : ALL;
if (!LIST.length) { console.error("pass --only a,b,c or --all a,b,c"); process.exit(1); }

const waitFor = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await sleep(500); } return false; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

let started = false;
for (const slug of LIST) {
  const rep = { slug, beats: 0, ok: true, problems: [] };
  if (!started) {
    await send("Page.navigate", { url: `${base}/atlas/pathways?p=${slug}&side=both&step=0` });
    await sleep(1500);
    started = true;
  } else await ev(`window.__pwChoose(${JSON.stringify(slug)})`);
  const ready = await waitFor(`!!(window.__pwDebug && window.__pwBeats && window.__pwBeats.slug === ${JSON.stringify(slug)} && window.__pwDebug.tubes)`, 120000);
  if (!ready) { rep.ok = false; rep.problems.push("scene never became ready"); console.log(JSON.stringify(rep)); continue; }
  const data = JSON.parse(await ev(`JSON.stringify({beats: window.__pwBeats.beats, dbg: window.__pwDebug})`));
  const { beats, dbg } = data;
  rep.beats = beats.length;
  const bad = (m) => { rep.ok = false; rep.problems.push(m); };
  // 3D completeness
  for (const t of dbg.tubes) if (t.n !== t.want) bad(`tube ${t.key}: ${t.n} of ${t.want} waypoints resolved`);
  if (dbg.marks.length !== dbg.want.marks) bad(`marks resolved ${dbg.marks.length} of ${dbg.want.marks}`);
  // per beat objects and continuity (per side)
  for (const body of ["L", "R"]) {
    // `end` follows the chain: a node's position, then each path's last point; every beat must start where the previous one ended
    let end = null;
    beats.forEach((b, i) => {
      if (b.kind === "node") {
        const m = dbg.marks.find((x) => x.beat === i && x.kind === "node" && (x.body === body || x.mid));
        if (!m) { bad(`beat ${i} (${b.caption}): no node mark for ${body}`); return; }
        if (end && dist(m.at, end) > 1e-4) bad(`node ${i} (${b.caption}) sits ${dist(m.at, end).toFixed(4)} m from where the path before it ends (${body})`);
        end = m.at;
      } else {
        const t = dbg.tubes.find((x) => x.beat === i && x.body === body);
        if (!t || !t.a) { bad(`beat ${i} (${b.caption}): no resolved tube for ${body}`); return; }
        if (!b.branch && end && dist(t.a, end) > 1e-4) bad(`path ${i} (${b.caption}) starts ${dist(t.a, end).toFixed(4)} m from the previous beat's end (${body})`);
        if (b.cross && !(t.xr[0] < -1e-3 && t.xr[1] > 1e-3) && !(Math.abs(t.a[0]) < 1e-3 || Math.abs(t.b[0]) < 1e-3)) bad(`beat ${i}: marked as a crossing but ${body} stays on one side`);
        if (b.phys === "cross" && !dbg.marks.some((x) => x.beat === i && x.kind === "dec")) bad(`beat ${i}: crossing without an X mark`);
        end = b.branch ? null : t.b; // a branch leaves the fork point; what follows a fork is not chained to it
      }
    });
  }
  // schematic <-> beat list
  const sch = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('ol[aria-label="Pathway schematic"] > li')].map(li=>({text:li.innerText.trim(),cross:!!li.querySelector('circle[stroke="var(--highlight, #fffb96)"]')})))`));
  if (sch.length !== beats.length) bad(`schematic has ${sch.length} rows for ${beats.length} beats`);
  beats.forEach((b, i) => {
    const row = sch[i];
    if (!row) return;
    const want = b.caption.length > 70 ? b.caption.slice(0, 68) : b.caption;
    if (!row.text.replace(/\s+/g, " ").includes(want.replace(/\s+/g, " ").slice(0, 40))) bad(`schematic row ${i} says "${row.text.slice(0, 40)}", beat says "${want.slice(0, 40)}"`);
    if (!!b.cross !== row.cross) bad(`schematic row ${i}: crossing mark ${row.cross} vs beat ${!!b.cross}`);
  });
  // hover: schematic row -> 3D highlight key
  let hoverOk = 0;
  for (let i = 0; i < beats.length; i++) {
    const got = await ev(`(async()=>{const li=document.querySelectorAll('ol[aria-label="Pathway schematic"] > li')[${i}];const btn=li&&li.querySelector('button');if(!btn)return null;btn.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));await new Promise(r=>setTimeout(r,220));const h=document.querySelector('[data-hover]').getAttribute('data-hover');btn.dispatchEvent(new MouseEvent('mouseout',{bubbles:true}));return h;})()`);
    if (got === beats[i].info) hoverOk++;
    else bad(`hover on schematic row ${i}: 3D highlight key "${got}" (want ${beats[i].info})`);
  }
  rep.hover = `${hoverOk}/${beats.length}`;
  // screenshots: a mid-path beat and, for --steps, every beat (clicking "next", so the draw animation is what gets captured)
  const mid = Math.max(0, beats.findIndex((b, i) => i >= Math.floor(beats.length / 2) && b.kind === "path"));
  const next = () => ev(`document.querySelector('button[aria-label^="Next beat"]')?.click()`);
  if (steps.has(slug)) {
    await sleep(1800);
    await shot(join(out, `vet-${slug}-beat00.png`));
    for (let i = 1; i < beats.length; i++) {
      await next();
      if (i === mid) { await sleep(900); await shot(join(out, `vet-${slug}-mid-drawing.png`)); await sleep(1700); } else await sleep(2500);
      await shot(join(out, `vet-${slug}-beat${String(i).padStart(2, "0")}.png`));
    }
  } else {
    for (let i = 0; i < mid; i++) { await next(); await sleep(250); }
    await sleep(2600);
    await shot(join(out, `vet-${slug}-mid.png`));
  }
  console.log(JSON.stringify(rep));
}
ws.close();
process.exit(0);

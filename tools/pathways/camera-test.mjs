// CDP test that the beat camera never fights the user (real mouse input via Input.dispatchMouseEvent), in and out of fullscreen:
//   node tools/pathways/camera-test.mjs --port 9364   (a headless window opened on /atlas/pathways with a pathway loaded, window.__pwCam / __pwRig set)
// Cases: drag during a tween, drag right after a beat change, wheel during a tween, drag after Frame (the camera follows again). For each it
// logs the camera before the press, at the release, and over the next 10 frames; a jump is a move of more than 2 mm between frames after release.
const port = Number(process.argv[process.argv.indexOf("--port") + 1] || 9364);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr, gesture = false) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, userGesture: gesture })).result?.result?.value;
const cam = () => ev(`window.__pwCam ? window.__pwCam.position.toArray() : null`);
const rig = () => ev(`window.__pwRig ? window.__pwRig() : null`);
const rect = () => ev(`(()=>{const r=document.querySelector("canvas").getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height}})()`);
const mouse = (type, x, y, button = "left", buttons = 1) => send("Input.dispatchMouseEvent", { type, x, y, button, buttons, clickCount: 1 });
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const next = () => ev(`document.querySelector('button[aria-label^="Next beat"]')?.click()`);
const frame = () => ev(`document.querySelector('button[aria-label^="Re-frame"]')?.click()`);
// frames after release: sample the camera every ~16 ms
const after = async () => { const s = []; for (let k = 0; k < 10; k++) { s.push(await cam()); await sleep(16); } return s; };
const maxStep = (s) => Math.max(0, ...s.slice(1).map((p, i) => dist(p, s[i])));
const out = {};

async function dragCase(name, { waitBefore = 0, beatChange = false, doFrame = false }) {
  if (beatChange) await next();
  if (doFrame) { await frame(); await sleep(1200); }
  await sleep(waitBefore);
  const r = await rect(); const x = r.x + r.w * 0.5, y = r.y + r.h * 0.5;
  const before = await cam();
  await mouse("mouseMoved", x, y, "none", 0);
  await mouse("mousePressed", x, y, "left", 1);
  const down = await cam();
  for (let k = 1; k <= 12; k++) { await mouse("mouseMoved", x + 10 * k, y + 4 * k, "left", 1); await sleep(16); }
  const atRelease = await cam();
  await mouse("mouseReleased", x + 120, y + 48, "left", 0);
  const frames = await after();
  await sleep(1500); // the beat tween would be over by now: the camera must still be where the user left it
  const settled = await cam();
  out[name] = { rig: await rig(), movedByUser: dist(before, atRelease) > 0.002, jumpAfterRelease: +dist(atRelease, frames[0]).toFixed(5), maxStepNext10: +maxStep(frames).toFixed(5), driftAfter1_5s: +dist(frames[9], settled).toFixed(5), downVsBefore: +dist(before, down).toFixed(5) };
}
async function wheelCase(name) {
  await next();
  await sleep(150);
  const r = await rect();
  const before = await cam();
  await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: r.x + r.w / 2, y: r.y + r.h / 2, deltaX: 0, deltaY: -300 });
  const frames = await after();
  await sleep(1500);
  const settled = await cam();
  out[name] = { rig: await rig(), movedByUser: dist(before, frames[9]) > 0.002, maxStepNext10: +maxStep(frames).toFixed(5), driftAfter1_5s: +dist(frames[9], settled).toFixed(5) };
}
async function suite(tag) {
  await ev(`document.querySelector('button[aria-label^="Previous beat"]')?.click()`);
  await frame(); await sleep(1500); // start unlocked and settled
  await dragCase(`${tag}:drag_during_tween`, { beatChange: true, waitBefore: 120 });
  await frame(); await sleep(1200);
  await dragCase(`${tag}:drag_right_after_beat_change`, { beatChange: true, waitBefore: 0 });
  await frame(); await sleep(1200);
  await wheelCase(`${tag}:wheel_during_tween`);
  await dragCase(`${tag}:drag_after_frame`, { doFrame: true, waitBefore: 0 });
  // beat change while locked must not move the camera
  const a = await cam(); await next(); await sleep(1500); out[`${tag}:beat_change_while_locked_moved`] = +dist(a, await cam()).toFixed(5);
}
for (let i = 0; i < 40 && !(await cam()); i++) await sleep(500);
await suite("normal");
await ev(`(async()=>{const h=document.querySelector("canvas").closest("[class*=overflow-hidden]");await h.requestFullscreen();await new Promise(r=>setTimeout(r,1500))})()`, true);
await suite("fullscreen");
await ev(`document.fullscreenElement ? document.exitFullscreen() : 0`, true);
console.log(JSON.stringify(out, null, 1));
ws.close();
process.exit(0);

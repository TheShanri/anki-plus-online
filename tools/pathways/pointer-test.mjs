// CDP pointer test for the pathway tracer / lesion lab scene: real mouse input (Input.dispatchMouseEvent), in and out of fullscreen.
//   node tools/pathways/pointer-test.mjs --port 9364      (a headless window opened by tools/ui/shot.mjs on the page under test)
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
const cam = () => ev(`window.__pwCam ? window.__pwCam.position.toArray().map(v=>+v.toFixed(4)).join(",") : null`);
const rect = () => ev(`(()=>{const r=document.querySelector("canvas").getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height}})()`);
const mouse = (type, x, y, button = "left", buttons = 1) => send("Input.dispatchMouseEvent", { type, x, y, button, buttons, clickCount: 1 });
const drag = async (button, dx, dy) => {
  const r = await rect(); const x = r.x + r.w * 0.5, y = r.y + r.h * 0.5;
  const b = button === "right" ? 2 : 1;
  const a = await cam();
  await mouse("mouseMoved", x, y, "none", 0);
  await mouse("mousePressed", x, y, button, b);
  for (let k = 1; k <= 12; k++) { await mouse("mouseMoved", x + (dx * k) / 12, y + (dy * k) / 12, button, b); await sleep(16); }
  await mouse("mouseReleased", x + dx, y + dy, button, 0);
  await sleep(500);
  return a !== (await cam());
};
const wheel = async () => {
  const r = await rect(); const a = await cam();
  await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: r.x + r.w / 2, y: r.y + r.h / 2, deltaX: 0, deltaY: -300 });
  await sleep(600);
  return a !== (await cam());
};
const out = {};
for (let i = 0; i < 40 && !(await cam()); i++) await sleep(500);
out.size_before = JSON.stringify(await rect());
out.rotate_before = await drag("left", 120, 40);
out.pan_before = await drag("right", 80, 50);
out.zoom_before = await wheel();
out.fs_enter = await ev(`(async()=>{const h=document.querySelector("canvas").closest("[class*=overflow-hidden]");try{await h.requestFullscreen();await new Promise(r=>setTimeout(r,1500));return !!document.fullscreenElement}catch(e){return "rejected: "+e.message}})()`, true);
out.size_fs = JSON.stringify(await rect());
out.rotate_fs = await drag("left", -100, 30);
out.pan_fs = await drag("right", -60, 40);
out.zoom_fs = await wheel();
await ev(`document.fullscreenElement ? document.exitFullscreen() : 0`, true);
await sleep(1800);
out.size_after = JSON.stringify(await rect());
out.rotate_after = await drag("left", 90, -30);
out.pan_after = await drag("right", 50, 30);
out.zoom_after = await wheel();
console.log(JSON.stringify(out, null, 1));
ws.close();
process.exit(0);

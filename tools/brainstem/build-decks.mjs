// Course deck pages for the brainstem atlas (model key, lab 8 slides, blank drawings, lab 8 answers).
// Writes src/data/brainstem-decks.json. Baked-in labels on the model-key drawings are read with Windows OCR
// (cached in deck-ocr.json; pass --ocr to redo it) and kept only when they match a structure on the course lists.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const build = join(root, "content-build");
const MK = "atlas-brainstem-atlas-and-model-key";
const P = (d, n) => `decks/${d}/pages/${String(n).padStart(3, "0")}.webp`;
const A = (n) => `decks/lab-08/answers_pages/${String(n).padStart(3, "0")}.webp`;
const L = { sc: "midbrain-sc", ic: "midbrain-ic", pm: "pons-mid", pc: "pons-caudal", mr: "medulla-rostral", mm: "medulla-mid", mc: "medulla-caudal" };
const defs = [];
const add = (key, level, style, title, ocr = false) => defs.push({ key, level, style, title, ocr });
// model key: line drawings with printed labels (odd pages) and unlabelled sections (even pages)
[[1, 2, L.mc, "Medulla, motor decussation"], [3, 4, L.mm, "Medulla, sensory decussation"], [5, 6, L.mr, "Rostral medulla, olive"], [7, 8, L.pc, "Caudal pons, facial colliculus"], [9, 10, L.pm, "Rostral pons, trigeminal"], [11, 12, L.ic, "Caudal midbrain, inferior colliculus"], [13, 14, L.sc, "Rostral midbrain, superior colliculus"]].forEach(([d, h, lv, t]) => {
  add(P(MK, d), lv, "cartoon", `Model key drawing: ${t}`, true);
  add(P(MK, h), lv, "histology", `Model key section: ${t}`);
});
add(P(MK, 15), "external-anterior", "cartoon", "Model key: ventral view with labels", true);
add(P(MK, 16), "external-posterior", "cartoon", "Model key: dorsal view with labels", true);
// lab 8: blank outline drawings (cartoon) and clean sections (histology) in pairs, and the answer pages
[[55, 56, L.sc, "Rostral midbrain"], [57, 58, L.ic, "Caudal midbrain"], [59, 60, L.pm, "Rostral pons"], [61, 62, L.pc, "Caudal pons"], [63, 64, L.mr, "Rostral medulla"], [65, 66, L.mm, "Caudal medulla"], [67, 68, L.mc, "Motor decussation"]].forEach(([, , lv, t], i) => {
  defs.push({ key: `decks/lab-08-blank-drawings/pages/${String(i * 2 + 1).padStart(3, "0")}.webp`, level: lv, style: "histology", title: `Lab 8 blank: ${t} (section)`, ocr: false });
  defs.push({ key: `decks/lab-08-blank-drawings/pages/${String(i * 2 + 2).padStart(3, "0")}.webp`, level: lv, style: "cartoon", title: `Lab 8 blank: ${t} (outline to label)`, ocr: false });
  add(A(i + 1), lv, "cartoon", `Lab 8 answer page: ${t}`);
});

const structs = JSON.parse(readFileSync(join(root, "content/nsci3250/structures.json"), "utf8"));
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(/^the /, "").replace(/\s+/g, " ").trim();
const dict = new Map();
for (const s of structs) for (const n of [s.name, ...(s.synonyms ?? []), ...(s.abbreviations ?? [])]) if (norm(n).length > 3 && !dict.has(norm(n))) dict.set(norm(n), s);

const ocrPath = join(here, "deck-ocr.json");
let ocr = existsSync(ocrPath) ? JSON.parse(readFileSync(ocrPath, "utf8")) : {};
if (process.argv.includes("--ocr")) {
  const tmp = join(tmpdir(), "brainstem-deck-ocr");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  for (const d of defs.filter((x) => x.ocr)) {
    const m = await sharp(join(build, d.key)).metadata();
    await sharp(join(build, d.key)).resize({ width: Math.max(m.width, 2600) }).png().toFile(join(tmp, d.key.replace(/[\/]/g, "_").replace(".webp", ".png")));
  }
  const out = join(tmp, "ocr.json");
  execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(here, "ocr.ps1"), "-Dir", tmp, "-Out", out], { stdio: "inherit" });
  const res = JSON.parse(readFileSync(out, "utf8").replace(/^﻿/, ""));
  ocr = {};
  for (const [id, r] of Object.entries(res)) ocr[id] = { w: r.w, h: r.h, lines: r.lines.map((l) => ({ t: l.text.trim(), x: l.x / r.w, y: l.y / r.h, w: l.w / r.w, h: l.h / r.h })) };
  writeFileSync(ocrPath, JSON.stringify(ocr));
}

function labelsFor(key) {
  const r = ocr[key.replace(/[\/]/g, "_").replace(".webp", "")];
  if (!r) return [];
  const ls = r.lines.filter((l) => /[A-Za-z]{3}/.test(l.t));
  const used = new Set();
  const out = [];
  const box = (a, b) => {
    const x0 = Math.min(a.x, b?.x ?? a.x), y0 = Math.min(a.y, b?.y ?? a.y);
    const x1 = Math.max(a.x + a.w, b ? b.x + b.w : 0), y1 = Math.max(a.y + a.h, b ? b.y + b.h : 0);
    const pad = 0.003;
    return { shape: "rect", x: Math.max(0, x0 - pad), y: Math.max(0, y0 - pad), w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
  };
  for (let i = 0; i < ls.length; i++) {
    if (used.has(i)) continue;
    const a = ls[i];
    // a label may wrap onto the next OCR line directly below it
    const next = ls.findIndex((b, j) => j > i && !used.has(j) && Math.abs(b.x - a.x) < 0.05 && b.y > a.y && b.y - (a.y + a.h) < a.h * 1.1);
    const tries = [];
    if (next >= 0) tries.push([`${a.t} ${ls[next].t}`, ls[next], next]);
    tries.push([a.t, null, -1]);
    for (const [txt, b, j] of tries) {
      const st = dict.get(norm(txt));
      if (!st) continue;
      used.add(i);
      if (j >= 0) used.add(j);
      out.push({ slug: st.slug, name: st.name, accept: [...new Set([...(st.synonyms ?? []), ...(st.abbreviations ?? [])])].slice(0, 8), kind: "structure", shape: box(a, b) });
      break;
    }
  }
  return out;
}

const out = [];
let n = 0;
for (const d of defs) {
  const m = await sharp(join(build, d.key)).metadata();
  const labels = d.ocr ? labelsFor(d.key) : [];
  out.push({ id: `deck-${n++}`, source: "course", key: d.key, w: m.width, h: m.height, level: d.level, style: d.style, title: d.title, labels });
}
writeFileSync(join(root, "src/data/brainstem-decks.json"), JSON.stringify(out));
writeFileSync(join(here, "deck-keys.json"), JSON.stringify(out.map((o) => o.key), null, 1));
console.log(out.length, "pages;", out.filter((o) => o.labels.length).map((o) => `${o.title.slice(0, 30)}: ${o.labels.length}`).join("; "));

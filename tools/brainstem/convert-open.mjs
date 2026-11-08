// Converts content-build/brainstem-open/manifest.json into public/brainstem/<id>.webp (max 1600 px) and
// src/data/brainstem-open.json. Only public domain / CC0 / CC BY / CC BY-SA entries go in.
//   node tools/brainstem/convert-open.mjs            convert (keeps OCR boxes already stored in open-labels.json)
//   node tools/brainstem/convert-open.mjs --ocr      also (re)run Windows OCR on entries with labels_baked_in
// The downloaded files are untrusted data: they are only decoded by sharp, never executed.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { join, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const src = join(root, "content-build", "brainstem-open");
const outDir = join(root, "public", "brainstem");
const labelsPath = join(here, "open-labels.json");
const ocr = process.argv.includes("--ocr");

const manifestPath = join(src, "manifest.json");
if (!existsSync(manifestPath)) {
  console.error("No manifest.json in content-build/brainstem-open yet.");
  process.exit(1);
}
let manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (!Array.isArray(manifest)) manifest = manifest.images ?? manifest.entries ?? Object.values(manifest);

const OK = /^(public domain|pd\b|pd-|cc0|cc[- ]by(?![- ]n)(?:[- ]sa)?\b)/i;
const levelsOk = new Set(["midbrain-sc", "midbrain-ic", "pons-rostral", "pons-mid", "pons-caudal", "medulla-rostral", "medulla-mid", "medulla-caudal", "cervicomedullary", "external-anterior", "external-posterior", "external-lateral", "midsagittal"]);
const styles = new Set(["histology", "gross", "cartoon"]);

const structs = JSON.parse(readFileSync(join(root, "content/nsci3250/structures.json"), "utf8"));
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/^the /, "").replace(/\s+/g, " ").trim();
const bySyn = new Map();
for (const s of structs) for (const n of [s.name, ...(s.synonyms ?? []), ...(s.abbreviations ?? [])]) if (!bySyn.has(norm(n))) bySyn.set(norm(n), s);

mkdirSync(outDir, { recursive: true });
const stored = existsSync(labelsPath) ? JSON.parse(readFileSync(labelsPath, "utf8")) : {};
const tmp = join(tmpdir(), "brainstem-ocr");
if (ocr) {
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
}

const out = [];
const skipped = [];
for (const m of manifest) {
  const file = m.file ?? m.path;
  const lic = String(m.license ?? m.licence ?? "");
  const levels = [].concat(m.level ?? m.levels ?? []);
  const style = m.style;
  const abs = file && join(src, file);
  if (!file || !existsSync(abs)) { skipped.push([file, "file missing"]); continue; }
  if (!OK.test(lic)) { skipped.push([file, `licence not allowed: ${lic}`]); continue; }
  if (!styles.has(style) || !levels.length || !levels.every((l) => levelsOk.has(l))) { skipped.push([file, `bad level/style: ${levels} ${style}`]); continue; }
  const base = basename(file, extname(file)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const id = `open-${base}`;
  const img = sharp(abs, { failOn: "none" }).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true });
  const { data, info } = await img.clone().webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
  writeFileSync(join(outDir, `${id}.webp`), data);
  if (ocr && m.labels_baked_in) await sharp(abs, { failOn: "none" }).rotate().resize({ width: 2600, height: 2600, fit: "inside" }).png().toFile(join(tmp, `${id}.png`));
  const clean = (t) => String(t ?? "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  const author = clean(m.author);
  const credit = clean(m.attribution) || [m.title, author && `by ${author}`, lic].filter(Boolean).join(", ");
  const first = author.split(/,| and /)[0].trim();
  const short = `${first.length > 28 ? first.slice(0, 26) + "..." : first}${/,| and /.test(author) ? " et al." : ""}, ${lic}`;
  for (const level of levels)
    out.push({
      id: levels.length > 1 ? `${id}-${level}` : id,
      source: "open",
      src: `/brainstem/${id}.webp`,
      w: info.width,
      h: info.height,
      level,
      style,
      title: m.display_title ?? m.title?.replace(/\.[a-z]+$/i, "").replace(/[_]+/g, " ") ?? base,
      credit,
      short,
      license: lic,
      url: m.source_page_url ?? m.url ?? "",
      labelsBaked: !!m.labels_baked_in,
      labelNote: m.label_note ?? "",
      labels: [],
      _fid: id,
    });
}

if (ocr) {
  const json = join(tmp, "ocr.json");
  execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(here, "ocr.ps1"), "-Dir", tmp, "-Out", json], { stdio: "inherit" });
  const res = JSON.parse(readFileSync(json, "utf8").replace(/^﻿/, ""));
  for (const [id, r] of Object.entries(res)) {
    stored[id] = (r.lines ?? [])
      .filter((l) => /[A-Za-z]{3}/.test(l.text) && l.h > 6 && l.h < r.h * 0.08)
      .map((l) => ({ text: l.text.trim(), x: l.x / r.w, y: l.y / r.h, w: l.w / r.w, h: l.h / r.h, words: (l.words ?? []).map((q) => ({ t: String(q.text).trim(), x: q.x / r.w, y: q.y / r.h, w: q.w / r.w, h: q.h / r.h })) }));
  }
  writeFileSync(labelsPath, JSON.stringify(stored, null, 1));
}
const abbr = JSON.parse(readFileSync(join(here, "coulombe-abbr.json"), "utf8"));
const rect = (b, pad) => ({ shape: "rect", x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), w: b.w + 2 * pad, h: b.h + 2 * pad });
for (const o of out) {
  const boxes = stored[o._fid] ?? [];
  if (o._fid.includes("fnana")) {
    // Coulombe plates print abbreviations: match each printed word to the key (case matters: Gr nucleus, gr fasciculus)
    const seen = new Set();
    o.labels = [];
    for (const b of boxes) for (const wd of b.words ?? []) {
      if (b.text.includes(":") || wd.y > 0.74) continue; // the printed key below the plate lists the same abbreviations
      const t = wd.t.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
      const a = abbr[t];
      if (!a || wd.h > 0.04) continue;
      const sig = `${t}${Math.round(wd.x * 60)},${Math.round(wd.y * 60)}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      o.labels.push({ slug: a[1], name: a[0], accept: [t], kind: "abbr", shape: rect(wd, 0.003) });
    }
  } else {
    // other plates: keep only printed labels that match a course structure (OCR of leader-line text is otherwise noisy)
    o.labels = boxes
      .filter((b) => bySyn.has(norm(b.text)))
      .map((b) => {
        const st = bySyn.get(norm(b.text));
        return { slug: st.slug, name: st.name, kind: "ocr", shape: rect(b, 0.004) };
      });
  }
  delete o._fid;
}
writeFileSync(join(root, "src/data/brainstem-open.json"), JSON.stringify(out));
// drop converted files that no longer belong
const keep = new Set(out.map((o) => o.src.split("/").pop()));
for (const f of readdirSync(outDir)) if (f.endsWith(".webp") && !keep.has(f)) rmSync(join(outDir, f));
console.log(`${out.length} open images in, ${skipped.length} skipped`);
for (const s of skipped) console.log("skipped", s[0], "-", s[1]);

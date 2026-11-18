import * as THREE from "three";
import { provideSectionOnly, type CutPlaneName } from "../ui/structureCut";
import { interiorNow, isField, labelIndexAt, type Interior, type LabelRow } from "./labels";
import { SEC } from "./shader";

/**
 * What the viewer and the interaction code ask of the labelled interior: hover / click on a cut, the section key, the
 * highlight state of the cut faces, a structure's bounds and best cut, and the structure-only cut.
 * All positions are world metres (the Z-Anatomy glTF space the meshes live in).
 */

const BRAINSTEM_IDS = new Set(["brainstem", "midbrain", "pons", "medulla-oblongata", "superior-cerebellar-peduncle", "mni-middle-cerebellar-peduncle", "mni-inferior-cerebellar-peduncle"]);
const BRAINSTEM_KEYS = new Set(["Aq", "4V", "cec", "BSW"]);
export const isBrainstemRow = (r: LabelRow) => BRAINSTEM_KEYS.has(r.key) || r.ids.some((id) => BRAINSTEM_IDS.has(id));

/** The section the viewer currently draws (set every render by the Scene). */
type Active = { on: boolean; planes: THREE.Plane[]; mid: THREE.Plane | null; showBrainstem: boolean };
const active: Active = { on: false, planes: [], mid: null, showBrainstem: true };
export function setSectionActive(on: boolean, planes: THREE.Plane[], mid: THREE.Plane | null, showBrainstem: boolean) {
  active.on = on;
  active.planes = planes;
  active.mid = mid;
  active.showBrainstem = showBrainstem;
}

// ---------------------------------------------------------------- highlight state (palette row 1)
type State = { hover: string | null; hoverRow: number; selected: Set<string>; only: Set<string> | null; onlyDim: boolean; colour: boolean; hues: Record<number, string> };
const st: State = { hover: null, hoverRow: 0, selected: new Set(), only: null, onlyDim: false, colour: false, hues: {} };
let redraw: (() => void) | null = null;
/** The Scene registers its invalidate, so state changes from outside (structure-only cut) repaint. */
export function setSectionRedraw(fn: (() => void) | null) {
  redraw = fn;
}
/** Picker result kept so the hover tint lights the label under the pointer, not every label sharing its atlas id. */
let lastPick: LabelRow | null = null;

const matches = (r: LabelRow, ids: Set<string>) => r.ids.some((id) => ids.has(id));
/** The interior the palette was last written for: the label volume loads after the first highlight call, so a state set
 * before it arrived is written when it does. */
let painted: Interior | null = null;
function refresh(I: Interior | null = interiorNow()) {
  if (!I) return;
  painted = I;
  const d = I.pal.image.data as Uint8Array;
  const c = new THREE.Color();
  for (const r of I.rows) {
    const o = (256 + r.i) * 4;
    let s = 0;
    // the background tissue (cortex, white matter, cerebellum) keeps the quiet palette the viewer already applies; only the
    // other structures recede, so the label volume's box never shows as a lighter rectangle
    if (st.only && !matches(r, st.only)) s = isField(r) ? 0 : 3;
    else if (st.hover && (st.hoverRow ? r.i === st.hoverRow || (lastPick?.name === r.name && r.ids[0] === st.hover) : r.ids[0] === st.hover)) s = 1;
    // the selection, and in "Show its cut" the structure itself, is drawn in the accent (the rest recedes, s = 3)
    else if (matches(r, st.selected) || (st.only && matches(r, st.only))) s = 2;
    c.set(st.hues[r.grp] ?? "#b9a9a0");
    d[o] = Math.round(c.r * 255);
    d[o + 1] = Math.round(c.g * 255);
    d[o + 2] = Math.round(c.b * 255);
    d[o + 3] = s;
  }
  I.pal.needsUpdate = true;
  redraw?.();
}

/** Group hues for "colour structures" (one hue per structure group, stable). */
const HUE_BY_KEY: Record<string, string> = {
  CaH: "#86a5c2", Pu: "#c4908c", NAC: "#c79fb4", GPe: "#d6b47c", GPi: "#e2c48e", Cla: "#a9b97f", SEP: "#cfc3d6", BF: "#cfc3d6", BNST: "#cfc3d6",
  AMY: "#c98484", HiH: "#86b79b", ANC: "#b79bc9", LGN: "#9f8fd0", MGN: "#c08fd0", HN: "#b79bc9", Pin: "#c9a3b8", ZI: "#b8b08a", STN: "#d08f6c",
  HTHpo: "#d29a78", MB: "#e0a070", CCg: "#e9dcc4", FXc: "#e3cf9f", ac: "#ecd9a4", PC: "#ecd9a4", mtt: "#e3cf9f", ot: "#e7dcc0", olt: "#e7dcc0",
  ICa: "#efe4cc", EC: "#efe4cc", ExC: "#efe4cc", aLV: "#4f5d77", "3V": "#4f5d77", Aq: "#4f5d77", "4V": "#4f5d77", SP: "#cfc3d6", CP: "#b0566f",
  SC: "#c6a98f", IC: "#c6a98f", PTR: "#c6a98f", PAG: "#b9a49a", MTg: "#b7aa9c", RN: "#c27a6e", SN: "#6f6a78", cpd: "#ece2c8", scp: "#e6d9b8",
  mcp: "#e6d9b8", icp: "#e6d9b8", PnBa: "#d8c9b0", MoPy: "#ece2c8", IO: "#b4977e", DN: "#a88f80", ML: "#e0d2b4", MLF: "#e0d2b4",
};
export function setSectionState(o: { hover: string | null; selected: string[]; colour: boolean; accent?: THREE.Color; hoverColor?: THREE.Color }) {
  const I = interiorNow();
  if (o.accent) SEC.uLabAccent.value.copy(o.accent);
  if (o.hoverColor) SEC.uLabHover.value.copy(o.hoverColor);
  SEC.uLabColour.value = o.colour ? 1 : 0;
  if (I && !Object.keys(st.hues).length) for (const r of I.rows) if (HUE_BY_KEY[r.key]) st.hues[r.grp] = HUE_BY_KEY[r.key];
  const hoverRow = o.hover && lastPick && lastPick.ids[0] === o.hover ? lastPick.i : 0;
  const sel = o.selected.join("|");
  if (painted === I && st.hover === o.hover && st.hoverRow === hoverRow && [...st.selected].join("|") === sel && st.colour === o.colour) return;
  st.hover = o.hover;
  st.hoverRow = hoverRow;
  st.selected = new Set(o.selected);
  st.colour = o.colour;
  refresh(I);
}
/** True when the labelled interior has this atlas id (its cut face is drawn by the labels). */
export function hasLabels(id: string): boolean {
  return !!interiorNow()?.rows.some((r) => r.vox > 0 && r.ids.includes(id));
}

// ---------------------------------------------------------------- structure-only cut
/**
 * Paint only these structures' cut faces (ids are atlas ids; any label carrying one of them counts). `dim`: the rest of
 * the section stays, washed toward the white-matter tone; otherwise it is not drawn at all. null turns it off.
 */
export function sectionOnly(ids: string[] | null, opts: { dim?: boolean } = {}) {
  st.only = ids && ids.length ? new Set(ids) : null;
  st.onlyDim = !!opts.dim;
  SEC.uLabOnly.value = st.only ? (st.onlyDim ? 2 : 1) : 0;
  refresh();
}

/** World bounds and centroid of a labelled structure (union over every label carrying the id), or null. */
export function structureBounds(ids: string | string[]): { centroid: THREE.Vector3; min: THREE.Vector3; max: THREE.Vector3; voxels: number } | null {
  const I = interiorNow();
  if (!I) return null;
  const want = new Set(typeof ids === "string" ? [ids] : ids);
  const rs = I.rows.filter((r) => r.vox > 0 && r.min && r.max && r.centroid && matches(r, want));
  if (!rs.length) return null;
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const c = new THREE.Vector3();
  let n = 0;
  for (const r of rs) {
    min.min(new THREE.Vector3(...r.min!));
    max.max(new THREE.Vector3(...r.max!));
    c.addScaledVector(new THREE.Vector3(...r.centroid!), r.vox);
    n += r.vox;
  }
  return { centroid: c.divideScalar(n), min, max, voxels: n };
}

/** Plane position (world, along the axis) through the structure's largest cross-section (its biggest label's). */
export function bestCut(ids: string | string[], axis: "x" | "y" | "z"): number | null {
  const I = interiorNow();
  if (!I) return null;
  const want = new Set(typeof ids === "string" ? [ids] : ids);
  const rs = I.rows.filter((r) => r.vox > 0 && r.best && matches(r, want)).sort((a, b) => b.vox - a.vox);
  return rs.length ? rs[0].best!["xyz".indexOf(axis)] : null;
}

provideSectionOnly({
  bounds: (ids) => {
    const b = structureBounds(ids);
    return b ? { min: b.min.toArray() as [number, number, number], max: b.max.toArray() as [number, number, number] } : null;
  },
  apply: (ids: string[] | null, _plane: CutPlaneName | null) => sectionOnly(ids, { dim: true }), // the rest recedes, never a hole
});

// ---------------------------------------------------------------- picking on the cut face
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
function kept(p: THREE.Vector3, planes: THREE.Plane[], skip: THREE.Plane | null) {
  return planes.every((pl) => pl === skip || pl.distanceToPoint(p) >= -1e-5);
}
const shown = (r: LabelRow) => (active.showBrainstem || !isBrainstemRow(r)) && (!st.only || matches(r, st.only));

/** What the midsagittal face shows at p (the same rule as the shader's labMidline): the cut label, the cavity wall, or null. */
function midlineRow(I: Interior, p: THREE.Vector3, n: THREE.Vector3): LabelRow | null {
  const r = I.byI[labelIndexAt(p, I)];
  if (!r) return null;
  if (r.key === "3V" || r.grp === I.rows.find((x) => x.key === "bLV")?.grp) {
    for (let s = 1; s <= 32; s++) {
      _q.copy(p).addScaledVector(n, s * 0.0005);
      const w = I.byI[labelIndexAt(_q, I)];
      if (!w) return null;
      if (w.key === "3V" || w.grp === r.grp) continue;
      if (w.cls === "ctx" || w.cls === "wm") return null;
      return w;
    }
    return null;
  }
  return r.cls === "ctx" || r.cls === "wm" ? null : r;
}

/**
 * The labelled structure under a view ray on the current section face: the point where the ray enters the kept side of the
 * cut. Null when no section is drawn, the point is not on the face, or it falls on cortex / white matter (the meshes and
 * the field answer there).
 */
export function sectionPickRay(ray: THREE.Ray): { row: LabelRow; point: THREE.Vector3; distance: number } | null {
  const I = interiorNow();
  if (!I || !active.on || !active.planes.length) return null;
  let best = -Infinity;
  let entry: THREE.Plane | null = null;
  for (const pl of active.planes) {
    const dn = pl.normal.dot(ray.direction);
    if (dn <= 1e-6) continue;
    const t = -(pl.normal.dot(ray.origin) + pl.constant) / dn;
    if (t > best) {
      best = t;
      entry = pl;
    }
  }
  if (!entry || best < 0) return null;
  ray.at(best, _p);
  if (!kept(_p, active.planes, entry)) return null;
  const r = entry === active.mid ? midlineRow(I, _p, entry.normal) : I.byI[labelIndexAt(_p, I)];
  if (!r || isField(r) || !shown(r)) return null;
  lastPick = r;
  return { row: r, point: _p.clone(), distance: best };
}

// ---------------------------------------------------------------- section key
export type KeyItem = { id: string; name: string; colour: string; key: string };
/** Thalamic nuclei other than the course's named ones, hypothalamic regions and the tegmental extras are listed under their parent. */
const KEY_PARENT: Record<string, string> = {
  MD: "THM", LD: "THM", LP: "THM", VA: "THM", VL: "THM", VPL: "THM", VPM: "THM", CM: "THM", MiN: "THM",
  HTHso: "HTHpo", HTHtub: "HTHpo", HiB: "HiH", HiT: "HiH",
  LC: "PnTg", MnR: "PnTg", LDTg: "PnTg", PBC: "PnTg", PnO: "PnTg", DR: "MTg", VTA: "MTg", mRt: "MTg", PTg: "MTg", ML: "MTg", MLF: "MTg", BSW: "MTg",
  CBPV: "CBV", CBL: "CBV", CBW: "CBV",
};
const KEY_NAME: Record<string, string> = { THM: "Thalamus", HTHpo: "Hypothalamus", HiH: "Hippocampus", CBV: "Cerebellum (cortex, arbor vitae)" };
const KEY_CORTEX = new Set(["CgG", "Ins", "PHG"]);

/**
 * The structures a set of section planes cuts, sampled on a 1 mm grid over each plane inside the label box (the midsagittal
 * plane by the same rule as its face). Swatches: the label's tone in the given palette, or its hue in colour mode.
 */
export function sectionKeyFor(planes: THREE.Plane[], mid: THREE.Plane | null, opts: { showBrainstem: boolean; colour: boolean; swatch: (r: LabelRow) => string }): KeyItem[] | null {
  const I = interiorNow();
  if (!I || !planes.length) return null;
  const count = new Map<number, number>();
  const box = new THREE.Box3(I.corner.clone(), I.corner.clone().add(I.size));
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => new THREE.Vector3(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z));
  const S = 0.001;
  for (const pl of planes) {
    const n = pl.normal;
    const u = new THREE.Vector3(1, 0, 0);
    if (Math.abs(n.x) > 0.9) u.set(0, 1, 0);
    u.addScaledVector(n, -u.dot(n)).normalize();
    const v = new THREE.Vector3().crossVectors(n, u);
    const o = pl.coplanarPoint(new THREE.Vector3());
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const c of corners) {
      const d = c.clone().sub(o);
      u0 = Math.min(u0, d.dot(u)); u1 = Math.max(u1, d.dot(u));
      v0 = Math.min(v0, d.dot(v)); v1 = Math.max(v1, d.dot(v));
    }
    for (let a = u0; a <= u1; a += S)
      for (let b = v0; b <= v1; b += S) {
        _p.copy(o).addScaledVector(u, a).addScaledVector(v, b);
        if (!box.containsPoint(_p) || !kept(_p, planes, pl)) continue;
        const r = pl === mid ? midlineRow(I, _p, n) : I.byI[labelIndexAt(_p, I)];
        if (!r || (isField(r) && !KEY_CORTEX.has(r.key))) continue;
        if (!opts.showBrainstem && isBrainstemRow(r)) continue;
        const k = I.rows.find((x) => x.key === (KEY_PARENT[r.key] ?? r.key)) ?? r;
        count.set(k.i, (count.get(k.i) ?? 0) + 1);
      }
  }
  const out: KeyItem[] = [];
  const seen = new Set<string>();
  for (const r of I.rows) {
    if ((count.get(r.i) ?? 0) < 3) continue;
    const name = KEY_NAME[r.key] ?? r.name;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ id: r.ids[0] ?? "", name, key: r.key, colour: opts.colour ? (st.hues[r.grp] ?? "#b9a9a0") : opts.swatch(r) });
  }
  return out;
}

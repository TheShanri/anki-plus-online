"use client";

import { useEffect, useRef, useState } from "react";
import type { Niivue } from "@niivue/niivue";
import { ATLAS2_BASE, structuresAtLabel } from "@/lib/atlas/slices";
import type { Atlas2 } from "@/lib/atlas/slices";

export type SliceView = "axial" | "coronal" | "sagittal" | "multi" | "render";
export const SLICE_VIEWS: { id: SliceView; label: string }[] = [
  { id: "coronal", label: "Coronal" },
  { id: "sagittal", label: "Sagittal" },
  { id: "axial", label: "Transverse" },
  { id: "multi", label: "Multiplanar" },
  { id: "render", label: "3D render" },
];

export type SliceOverlay = { slug: string; color: string };

type Props = {
  atlas: Atlas2;
  primary: string | null;
  primaryColor: string;
  overlays: SliceOverlay[];
  view: SliceView;
  /** Jump the crosshair to this structure's centroid whenever it changes. */
  jumpTo: string | null;
  onPick?: (slug: string) => void;
  height?: number;
  backColor?: [number, number, number, number];
};

function hexRgb(h: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  if (!m) return [255, 42, 109];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Colour every label of the given structures (first writer wins: primary, then overlays in order). */
function buildMaps(atlas: Atlas2, items: { slug: string; color: string }[]) {
  const m1 = new Map<number, string>();
  const m2 = new Map<number, string>();
  for (const it of items) {
    const s = atlas.structures[it.slug];
    if (!s) continue;
    for (const l of s.labels) if (!m1.has(l)) m1.set(l, it.color);
    for (const l of s.tracts) if (!m2.has(l)) m2.set(l, it.color);
  }
  return [m1, m2] as const;
}

function lutFor(leaves: { id: number; name: string }[], colors: Map<number, string>) {
  const R = [0], G = [0], B = [0], A = [0], I = [0], labels = [""];
  for (const l of leaves) {
    const c = colors.get(l.id);
    const [r, g, b] = c ? hexRgb(c) : [0, 0, 0];
    R.push(r); G.push(g); B.push(b); A.push(c ? 255 : 0); I.push(l.id); labels.push(l.name);
  }
  return { R, G, B, A, I, labels };
}

export default function SliceViewer({ atlas, primary, primaryColor, overlays, view, jumpTo, onPick, height = 560, backColor }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nvRef = useRef<Niivue | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [probe, setProbe] = useState<{ mm: number[]; slugs: string[] } | null>(null);
  const atlasRef = useRef(atlas);
  useEffect(() => {
    atlasRef.current = atlas;
  }, [atlas]);

  // mount: lazy-load NiiVue and the three volumes; dispose the GL context on unmount
  useEffect(() => {
    let dead = false;
    const canvas = canvasRef.current;
    (async () => {
      try {
        const { Niivue } = await import("@niivue/niivue");
        if (dead || !canvas) return;
        const nv = new Niivue({
          backColor: backColor ?? [0.03, 0.03, 0.06, 1],
          crosshairColor: [1, 1, 1, 0.55],
          crosshairWidth: 0.6,
          show3Dcrosshair: false,
          isColorbar: false,
          dragAndDropEnabled: false,
          loadingText: "",
          multiplanarForceRender: true,
          isRuler: false,
          tooltip: false,
        } as ConstructorParameters<typeof Niivue>[0]);
        nvRef.current = nv;
        if (process.env.NODE_ENV !== "production") (window as unknown as { __nv?: unknown }).__nv = nv; // debugging hook (dev only)
        await nv.attachToCanvas(canvas);
        await nv.loadVolumes([
          { url: `${ATLAS2_BASE}/template.nii.gz`, colormap: "gray", opacity: 1 },
          { url: `${ATLAS2_BASE}/labels.nii.gz`, colormap: "gray", opacity: 1 },
          { url: `${ATLAS2_BASE}/tracts.nii.gz`, colormap: "gray", opacity: 1 },
        ]);
        if (dead) return;
        nv.onLocationChange = (d: unknown) => {
          const loc = d as { mm: number[]; values: { value: number }[] };
          const l1 = Math.round(loc.values?.[1]?.value ?? 0);
          const l2 = Math.round(loc.values?.[2]?.value ?? 0);
          setProbe({ mm: Array.from(loc.mm ?? []).slice(0, 3), slugs: structuresAtLabel(atlasRef.current, l1, l2) });
        };
        setReady(true);
      } catch (e) {
        if (!dead) setError(String((e as Error)?.message ?? e));
      }
    })();
    return () => {
      dead = true;
      const nv = nvRef.current;
      nvRef.current = null;
      try {
        nv?.gl?.getExtension("WEBGL_lose_context")?.loseContext();
      } catch {
        /* ignore */
      }
    };
  }, [backColor]);

  // slice layout
  useEffect(() => {
    const nv = nvRef.current;
    if (!ready || !nv) return;
    const t = { axial: 0, coronal: 1, sagittal: 2, multi: 3, render: 4 }[view];
    nv.setSliceType(t);
    if (view === "render") nv.setRenderAzimuthElevation(150, 15);
  }, [ready, view]);

  // colours for primary / overlays
  const overlayKey = overlays.map((o) => o.slug + o.color).join("|");
  useEffect(() => {
    const nv = nvRef.current;
    if (!ready || !nv || nv.volumes.length < 3) return;
    const items = [...(primary ? [{ slug: primary, color: primaryColor }] : []), ...overlays];
    const [m1, m2] = buildMaps(atlas, items);
    nv.volumes[1].setColormapLabel(lutFor(atlas.leaf1, m1));
    nv.volumes[2].setColormapLabel(lutFor(atlas.leaf2, m2));
    // value 0 (background) must stay transparent
    nv.volumes[1].colormapType = 1;
    nv.volumes[2].colormapType = 1;
    nv.updateGLVolume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, atlas, primary, primaryColor, overlayKey]);

  // crosshair jump
  useEffect(() => {
    const nv = nvRef.current;
    if (!ready || !nv || !jumpTo) return;
    const c = atlas.structures[jumpTo]?.centroid;
    if (!c) return;
    const m2f = (nv as unknown as { mm2frac: (mm: number[]) => Niivue["scene"]["crosshairPos"] }).mm2frac.bind(nv);
    nv.scene.crosshairPos = m2f(c);
    nv.updateGLVolume();
  }, [ready, atlas, jumpTo, view]);

  const top = probe?.slugs[0];
  return (
    <div className="relative w-full overflow-hidden rounded-card border border-panel-border bg-bg-2" style={{ height }}>
      <canvas ref={canvasRef} className="block h-full w-full" aria-label="MRI slice viewer" />
      {!ready && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-text-dim" role="status">
          Loading MRI slices...
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-text-dim" role="alert">
          The MRI slice viewer could not be started ({error}).
        </div>
      )}
      <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex flex-wrap items-center gap-2 font-mono text-[11px] text-text-dim">
        <span className="rounded-sm border border-panel-border bg-panel px-2 py-1 backdrop-blur">
          {probe ? `x ${probe.mm.map((v) => Math.round(v)).join("  y ")}`.replace(/^x (-?\d+) {2}y (-?\d+) {2}y (-?\d+)$/, "x $1  y $2  z $3") + " mm" : "Click a voxel to name it"}
        </span>
        {probe && (
          <span className="pointer-events-auto rounded-sm border border-panel-border bg-panel px-2 py-1 text-text backdrop-blur">
            {top ? (
              <>
                {atlas.structures[top].name}
                {onPick && (
                  <button type="button" className="ml-2 text-accent-2 underline underline-offset-2" onClick={() => onPick(top)}>
                    select
                  </button>
                )}
              </>
            ) : (
              "not a curriculum structure"
            )}
          </span>
        )}
      </div>
    </div>
  );
}

"use client";

import "@/components/study/study.css"; // help-line, kbd, chip, choice styles
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AtlasOverlay } from "../AtlasViewer";
import { LazyAtlasViewer } from "../supply/lazy";
import { atlasTargetForSlug } from "@/lib/atlas/catalog";
import { readCssColor } from "@/lib/atlas/theme";

type Row = {
  slug: string;
  name: string;
  strength: number | null;
  retrievability: number | null;
  stabilityDays: number | null;
  cards: number;
  seen: number;
  lapses: number;
};
type Payload = { structures: Row[]; course: string; generatedAt: string };

const BUCKETS = 8;
/** A structure is in a "red zone" below this strength. */
const RED = 0.5;
const MAX_SLUGS = 60;

function pct(v: number | null): string {
  return v === null ? "unseen" : `${Math.round(v * 100)}%`;
}

function palette(): { buckets: string[]; unseen: string } {
  const again = readCssColor("--again", "#ef4444");
  const hard = readCssColor("--hard", "#f59e0b");
  const good = readCssColor("--good", "#22c55e");
  const buckets: string[] = [];
  for (let k = 0; k < BUCKETS; k++) {
    const s = (k + 0.5) / BUCKETS;
    const c = s < 0.5 ? again.clone().lerp(hard, s / 0.5) : hard.clone().lerp(good, (s - 0.5) / 0.5);
    buckets.push("#" + c.getHexString());
  }
  return { buckets, unseen: "#" + readCssColor("--text-faint", "#8a8a8a").getHexString() };
}

export function MemoryMap() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null); // slug

  useEffect(() => {
    let alive = true;
    fetch("/api/atlas/strength", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        return j as Payload;
      })
      .then((j) => alive && setData(j))
      .catch((e) => alive && setError(String(e.message ?? e)));
    return () => {
      alive = false;
    };
  }, []);

  const model = useMemo(() => {
    if (!data) return null;
    const pal = palette();
    const bySlug = new Map(data.structures.map((r) => [r.slug, r]));
    // mesh id -> the structures drawn by it (a mesh can stand for several curriculum entries)
    const meshRows = new Map<string, Row[]>();
    for (const r of data.structures) {
      const t = atlasTargetForSlug(r.slug);
      if (!t || t.approximate) continue;
      for (const id of t.ids) meshRows.set(id, [...(meshRows.get(id) ?? []), r]);
    }
    const meshValue = (id: string): number | null => {
      const rows = (meshRows.get(id) ?? []).filter((r) => r.strength !== null);
      return rows.length ? rows.reduce((s, r) => s + (r.strength as number), 0) / rows.length : null;
    };
    const groups = new Map<string, string[]>();
    for (const id of meshRows.keys()) {
      const v = meshValue(id);
      const key = v === null ? "unseen" : `b${Math.min(BUCKETS - 1, Math.floor(v * BUCKETS))}`;
      groups.set(key, [...(groups.get(key) ?? []), id]);
    }
    const overlays: AtlasOverlay[] = [...groups].map(([key, ids]) => ({
      key,
      ids,
      color: key === "unseen" ? pal.unseen : pal.buckets[Number(key.slice(1))],
      opacity: key === "unseen" ? 0.8 : 0.95,
    }));
    const seen = data.structures.filter((r) => r.strength !== null);
    const weakest = seen.slice().sort((a, b) => (a.strength as number) - (b.strength as number));
    const red = weakest.filter((r) => (r.strength as number) < RED);
    const mean = seen.length ? seen.reduce((s, r) => s + (r.strength as number), 0) / seen.length : null;
    return { pal, bySlug, meshRows, overlays, weakest, red, mean, unseen: data.structures.length - seen.length, seenCount: seen.length };
  }, [data]);

  const tipText = useCallback(
    (id: string, name: string) => {
      const rows = model?.meshRows.get(id);
      if (!rows?.length) return name;
      const r = rows[0];
      return `${name}: ${pct(r.strength)}`;
    },
    [model],
  );
  const onPick = useCallback(
    (id: string) => {
      const rows = model?.meshRows.get(id);
      if (rows?.length) setSel(rows.slice().sort((a, b) => (a.strength ?? 2) - (b.strength ?? 2))[0].slug);
    },
    [model],
  );

  if (error) {
    return (
      <div className="panel text-sm text-text-dim" role="alert">
        Could not load your memory map ({error}).
      </div>
    );
  }
  if (!data || !model) {
    return (
      <div className="panel text-sm text-text-dim" role="status">
        Reading your card states...
      </div>
    );
  }

  const chosen = sel ? model.bySlug.get(sel) ?? null : null;
  const focusIds = chosen ? (atlasTargetForSlug(chosen.slug)?.ids ?? []) : [];
  const studySlugs = model.red.slice(0, MAX_SLUGS).map((r) => r.slug);
  const redHref = `/study/run?scope=structures:${studySlugs.join(",")}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid gap-2">
        <LazyAtlasViewer
          structureIds={focusIds}
          mode="context"
          label={chosen?.name ?? ""}
          height={560}
          overlays={model.overlays}
          hideLabels
          pickMode="mesh"
          tipText={tipText}
          onPickMesh={onPick}
        />
        <p className="help-line">
          <span>
            <span className="kbd">click</span> a structure for its numbers
          </span>
          <span>Strength = how likely you are to recall it today (FSRS), from all its cards.</span>
        </p>
      </div>

      <div className="grid content-start gap-3">
        <div className="panel grid gap-2">
          <h2 className="font-display text-sm uppercase tracking-wider text-text-dim">Legend</h2>
          <div className="h-3 rounded-sm border border-panel-border" style={{ background: "linear-gradient(to right, var(--again), var(--hard), var(--good))" }} aria-hidden="true" />
          <div className="flex justify-between font-mono text-[11px] text-text-dim">
            <span>weak (0%)</span>
            <span>solid (100%)</span>
          </div>
          <p className="flex items-center gap-2 text-sm text-text-dim">
            <span className="inline-block h-3 w-3 rounded-sm border border-panel-border" style={{ background: model.pal.unseen }} aria-hidden="true" />
            Grey: not seen yet ({model.unseen} structures)
          </p>
          <p className="text-sm">
            {model.seenCount} structures seen{model.mean !== null ? `, average strength ${pct(model.mean)}` : ""}.
          </p>
        </div>

        <div className="panel grid gap-2">
          {model.red.length > 0 ? (
            <Link href={redHref} className="btn btn-primary no-underline">
              Study my red zones ({Math.min(model.red.length, MAX_SLUGS)})
            </Link>
          ) : (
            <p className="text-sm text-text-dim">{model.seenCount ? "No red zones: every structure you have seen is above 50%." : "Answer some cards first; your red zones will appear here."}</p>
          )}
        </div>

        {chosen && (
          <div className="panel grid gap-1.5" aria-live="polite">
            <h2 className="font-display text-base text-accent">{chosen.name}</h2>
            <p className="text-sm">
              Strength <strong>{pct(chosen.strength)}</strong>
              {chosen.retrievability !== null && <> (recall now {pct(chosen.retrievability)}, stability {Math.round(chosen.stabilityDays ?? 0)} d)</>}
            </p>
            <p className="text-sm text-text-dim">
              {chosen.seen} of {chosen.cards} cards answered{chosen.lapses ? `, ${chosen.lapses} lapses` : ""}.
            </p>
            <Link href={`/study/run?scope=structure:${chosen.slug}`} className="btn no-underline">
              Study this structure
            </Link>
          </div>
        )}

        <div className="panel grid gap-2">
          <h2 className="font-display text-sm uppercase tracking-wider text-text-dim">Weakest structures</h2>
          {model.weakest.length === 0 ? (
            <p className="text-sm text-text-dim">Nothing seen yet.</p>
          ) : (
            <ol className="grid gap-1">
              {model.weakest.slice(0, 12).map((r) => (
                <li key={r.slug}>
                  <button
                    type="button"
                    onClick={() => setSel(r.slug)}
                    className={`flex w-full items-center gap-2 rounded-sm border px-2 py-1 text-left text-sm ${sel === r.slug ? "border-accent" : "border-transparent hover:border-panel-border-hi"}`}
                  >
                    <span className="truncate">{r.name}</span>
                    <span className="ml-auto flex-none font-mono text-xs" style={{ color: (r.strength as number) < RED ? "var(--again)" : "var(--text-dim)" }}>
                      {pct(r.strength)}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { loadAtlasIndex, normalizeQuery } from "@/lib/atlas";
import type { AtlasIndex } from "@/lib/atlas";
import { atlasTargetForCourseName, courseNamesByAtlasId } from "@/lib/atlas/map";

const AtlasViewer = dynamic(() => import("./AtlasViewer"), {
  ssr: false,
  loading: () => (
    <div
      className="flex items-center justify-center rounded-card border border-panel-border text-sm text-text-dim"
      style={{ height: 560 }}
    >
      Loading 3D model...
    </div>
  ),
});

type Selection = { ids: string[]; approximate: boolean; label?: string };

function initialSelection(s: string | undefined, n: string | undefined): Selection | null {
  if (n) {
    const t = atlasTargetForCourseName(n);
    if (t) return { ids: t.ids, approximate: t.approximate, label: n };
  }
  if (s) {
    const ids = s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    if (ids.length) return { ids, approximate: false };
  }
  return null;
}

export function AtlasBrowser({ initialS, initialN }: { initialS?: string; initialN?: string }) {
  const [index, setIndex] = useState<AtlasIndex | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("all");
  const [sel, setSel] = useState<Selection | null>(() => initialSelection(initialS, initialN));

  useEffect(() => {
    let alive = true;
    loadAtlasIndex()
      .then((i) => alive && setIndex(i))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);

  const synonyms = useMemo(() => courseNamesByAtlasId(), []);
  const rows = useMemo(() => {
    if (!index) return [];
    return Object.values(index.structures).map((e) => ({
      e,
      hay: normalizeQuery([e.name, e.latin ?? "", e.id.replace(/-/g, " "), ...(synonyms.get(e.id) ?? [])].join(" ")),
    }));
  }, [index, synonyms]);

  const results = useMemo(() => {
    const terms = normalizeQuery(q).split(" ").filter(Boolean);
    return rows
      .filter((r) => (region === "all" || r.e.region === region) && terms.every((t) => r.hay.includes(t)))
      .sort((a, b) => a.e.name.localeCompare(b.e.name))
      .slice(0, 120)
      .map((r) => r.e);
  }, [rows, q, region]);

  function pick(id: string) {
    setSel({ ids: [id], approximate: false });
    try {
      window.history.replaceState(null, "", `/atlas?s=${encodeURIComponent(id)}`);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <div className="panel flex flex-col gap-3" style={{ maxHeight: 560 }}>
        <label className="sr-only" htmlFor="atlas-search">
          Search structures
        </label>
        <input
          id="atlas-search"
          className="input"
          type="search"
          placeholder="Search structures, Latin, course names"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
        <label className="sr-only" htmlFor="atlas-region">
          Region
        </label>
        <select id="atlas-region" className="input" value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="all">All regions</option>
          {index &&
            Object.entries(index.regions).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
        </select>
        {error && <p className="text-sm text-again">Could not load the atlas index.</p>}
        <ul className="-mx-1 flex-1 overflow-y-auto pr-1" aria-label="Structures">
          {results.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => pick(e.id)}
                className={`flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left text-sm hover:bg-panel-2 ${
                  sel?.ids.length === 1 && sel.ids[0] === e.id ? "bg-panel-2 text-accent" : ""
                }`}
              >
                <span>{e.name}</span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-text-faint">
                  {index?.regions[e.region] ?? e.region}
                  {e.file ? "" : " (group)"}
                </span>
              </button>
            </li>
          ))}
          {index && results.length === 0 && <li className="px-2 py-3 text-sm text-text-dim">No structures match.</li>}
        </ul>
      </div>
      <div>
        <AtlasViewer
          structureIds={sel?.ids ?? []}
          mode={sel ? "focus" : "context"}
          approximate={sel?.approximate}
          label={sel?.label}
          height={560}
        />
        {!sel && (
          <p className="mt-2 text-sm text-text-dim">
            Pick a structure to highlight it. Drag to rotate, scroll or pinch to zoom, right-drag or two fingers to pan.
          </p>
        )}
      </div>
    </div>
  );
}

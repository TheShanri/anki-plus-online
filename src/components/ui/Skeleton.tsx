/** Shaped placeholders that match the final layout (instead of "Loading…" text). */
export function CardSkeleton({ label = "Loading your cards" }: { label?: string }) {
  return (
    <div className="st-wrap" aria-busy="true">
      <div className="st-top">
        <div className="skel" style={{ width: 220, height: 18 }} />
      </div>
      <div className="panel st-card" style={{ display: "grid", gap: 12 }}>
        <div className="skel" style={{ width: 90, height: 14 }} />
        <div className="skel" style={{ width: "70%", height: 22 }} />
        <div className="skel" style={{ width: "45%", height: 22 }} />
        <div className="skel" style={{ height: 44, marginTop: 10 }} />
      </div>
      <p className="sr-only" role="status">{label}…</p>
    </div>
  );
}

export function ViewerSkeleton({ height = 480, label = "Loading the 3D model" }: { height?: number | string; label?: string }) {
  return (
    <div className="skel" style={{ height, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius)" }} aria-busy="true">
      <span className="text-sm text-text-dim">{label}…</span>
    </div>
  );
}

export function LinesSkeleton({ lines = 3, label = "Loading" }: { lines?: number; label?: string }) {
  return (
    <div style={{ display: "grid", gap: 8 }} aria-busy="true">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skel" style={{ height: 12, width: `${90 - i * 17}%` }} />
      ))}
      <span className="sr-only" role="status">{label}…</span>
    </div>
  );
}

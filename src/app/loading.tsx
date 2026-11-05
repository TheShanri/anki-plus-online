/** Shown the moment a link is clicked while the next page renders on the server (every route). */
export default function Loading() {
  return (
    <section aria-busy="true">
      <header className="page-head">
        <div className="skel skel-kicker" />
        <div className="skel skel-title" />
      </header>
      <div className="skel-grid">
        <div className="skel skel-panel" />
        <div className="skel skel-panel" />
        <div className="skel skel-panel" />
      </div>
      <div className="skel-grid" style={{ marginTop: 18 }}>
        <div className="skel skel-row" />
        <div className="skel skel-row" />
      </div>
      <p className="sr-only" role="status">Loading…</p>
    </section>
  );
}

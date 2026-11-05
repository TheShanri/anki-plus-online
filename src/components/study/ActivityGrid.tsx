/** Streak and a 20-week calendar of study days. Server-rendered from engine_activity(). */
export function ActivityGrid({ days, streak }: { days: Array<{ day: string; reviews: number }>; streak: number }) {
  const by = new Map(days.map((d) => [d.day, d.reviews]));
  const cells: Array<{ key: string; level: number; n: number }> = [];
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - (20 * 7 - 1) - start.getDay());
  for (let i = 0; i < 21 * 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (d > today) break;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const n = by.get(key) ?? 0;
    cells.push({ key, n, level: n === 0 ? 0 : n < 10 ? 1 : n < 25 ? 2 : n < 50 ? 3 : 4 });
  }
  return (
    <div className="panel">
      <p className="label">Your streak</p>
      <p className="font-display text-3xl">{streak} day{streak === 1 ? "" : "s"}</p>
      <div className="grid-act" style={{ marginTop: 10, overflowX: "auto" }} aria-label="Days you studied">
        {cells.map((c) => (
          <i key={c.key} className={c.level ? `l${c.level}` : ""} title={`${c.key}: ${c.n} review${c.n === 1 ? "" : "s"}`} />
        ))}
      </div>
    </div>
  );
}

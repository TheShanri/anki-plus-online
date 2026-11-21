/** Streak and a 20-week calendar of study days, in the course's time zone (the home screen's days, lib/home/data). */
export function ActivityGrid({ days, streak, today }: { days: Array<{ day: string; reviews: number; minutes?: number }>; streak: number; today: string }) {
  const by = new Map(days.map((d) => [d.day, d]));
  const cells: Array<{ key: string; level: number; title: string }> = [];
  // day strings are calendar dates: step them in UTC so the server's own zone never shifts a day
  const end = new Date(`${today}T00:00:00Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (20 * 7 - 1) - start.getUTCDay());
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    const rec = by.get(key);
    const n = rec?.reviews ?? 0;
    const nice = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
    const mins = rec?.minutes ? ` · ${rec.minutes} min studied` : "";
    cells.push({ key, level: n === 0 ? 0 : n < 10 ? 1 : n < 25 ? 2 : n < 50 ? 3 : 4, title: `${n ? `${n} review${n === 1 ? "" : "s"}` : "No card reviews"} · ${nice}${mins}` });
  }
  return (
    <div className="panel">
      <p className="label">Your streak</p>
      <p className="font-display text-3xl">{streak} day{streak === 1 ? "" : "s"}</p>
      <div className="grid-act" style={{ marginTop: 10, overflowX: "auto" }} aria-label="Days you studied">
        {cells.map((c) => (
          <i key={c.key} className={c.level ? `l${c.level}` : ""} title={c.title} />
        ))}
      </div>
    </div>
  );
}

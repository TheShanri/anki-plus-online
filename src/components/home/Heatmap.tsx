// GitHub-style activity grid (port of ANKI+ web/js/components/heatmap.js). Server-rendered, themed through
// --hm-l0..l5. 53 weeks; on a phone it scrolls horizontally and starts at the newest week.
import type { ActivityDay } from "@/lib/home/data";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function utc(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function Heatmap({ days, today, weeks = 53 }: { days: ActivityDay[]; today: string; weeks?: number }) {
  const by = new Map(days.map((d) => [d.day, d]));
  const end = utc(today);
  end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (weeks * 7 - 1));

  const vals = days.map((d) => d.reviews).filter((v) => v > 0).sort((a, b) => a - b);
  const q = (p: number) => (vals.length ? vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] : 1);
  const th = [q(0.2), q(0.45), q(0.7), q(0.9)];
  const level = (v: number) => {
    if (!v) return 0;
    let l = 1;
    for (const t of th) if (v > t) l++;
    return Math.min(5, l);
  };

  const cols = [];
  let lastMonth = -1;
  const cur = new Date(start);
  for (let w = 0; w < weeks; w++) {
    let label = "";
    const cells = [];
    for (let d = 0; d < 7; d++) {
      const key = iso(cur);
      if (d === 0 && cur.getUTCDate() <= 7 && cur.getUTCMonth() !== lastMonth) {
        lastMonth = cur.getUTCMonth();
        label = MONTHS[lastMonth];
      }
      const future = key > today;
      const rec = by.get(key);
      const n = rec?.reviews ?? 0;
      const nice = cur.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
      cells.push(
        <div
          key={key}
          className="hm-cell"
          data-l={future ? undefined : level(n)}
          data-future={future ? "" : undefined}
          data-today={key === today ? "" : undefined}
          title={future ? undefined : `${n ? `${n} review${n === 1 ? "" : "s"}` : "No reviews"} · ${nice}${rec && rec.minutes ? ` · ${rec.minutes} min` : ""}`}
        />,
      );
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    cols.push(
      <div className="hm-col" key={w}>
        <span className="hm-month">{label}</span>
        {cells}
      </div>,
    );
  }

  return (
    <div className="hm" style={{ ["--hm-cell" as string]: "13px", ["--hm-gap" as string]: "3px" }} role="img" aria-label="Your study activity over the last year">
      <div className="hm-wrap">
        <div className="hm-days" aria-hidden>
          <span />
          <span />
          <span>Mon</span>
          <span />
          <span>Wed</span>
          <span />
          <span>Fri</span>
          <span />
        </div>
        <div className="hm-scroll">
          <div className="hm-cols">{cols}</div>
        </div>
      </div>
      <div className="hm-legend" aria-hidden>
        <span>Less</span>
        {[0, 1, 2, 3, 4, 5].map((l) => (
          <i key={l} style={{ background: `var(--hm-l${l})` }} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

"use client";
// A small sagittal brainstem (anterior to the left) with the current cut line, for the corner of the plate.
import { LEVELS } from "../data";

// Silhouette in a 64 x 132 box: midbrain at the top, the pons bulging forward, the medulla tapering into the cord.
const STEM = "M27 6 C33 5 41 6 46 9 C47 16 46 22 45 27 C50 31 52 38 50 44 C47 49 44 52 43 56 C42 66 41 76 40 86 C39 98 38 110 37 126 L28 126 C28 112 27 100 25 90 C23 82 21 76 20 70 C12 66 8 56 9 46 C10 36 16 30 22 27 C23 20 24 12 27 6 Z";
const CEREB = "M47 42 C56 38 62 46 61 56 C60 66 53 72 45 70 C44 62 44 52 47 42 Z";
const Y0 = 8;
const Y1 = 124;

export function LevelLocator({ level, size = 66 }: { level: string; size?: number }) {
  const lv = LEVELS.find((l) => l.slug === level);
  const y = lv?.y !== undefined ? Y0 + lv.y * (Y1 - Y0) : null;
  return (
    <svg viewBox="0 0 64 132" width={size * (64 / 132)} height={size} className="bsp-loc" aria-hidden>
      <path d={CEREB} className="bsp-loc-cb" />
      <path d={STEM} className="bsp-loc-stem" />
      {LEVELS.filter((l) => l.kind === "section" && l.y !== undefined).map((l) => (
        <line key={l.slug} x1={6} x2={56} y1={Y0 + l.y! * (Y1 - Y0) + 3} y2={Y0 + l.y! * (Y1 - Y0) - 3} className="bsp-loc-tick" />
      ))}
      {y !== null && <line x1={2} x2={60} y1={y + 4} y2={y - 4} className="bsp-loc-cut" />}
    </svg>
  );
}

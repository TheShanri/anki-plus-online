import { useId } from "react";

/** Wireframe brain (lateral view): outline, sulci and a contour mesh clipped to the cerebrum, plus cerebellum and stem.
 * Strokes use the neon palette via CSS variables so it can sit on any scene. Pure SVG, no animation inside. */
export function BrainSvg({ className, glow = true }: { className?: string; glow?: boolean }) {
  const clip = useId().replace(/:/g, "");
  const cerebrum =
    "M64 176 C38 156 36 112 68 88 C80 54 124 36 160 46 C188 22 240 20 268 42 C304 32 348 54 358 92 C384 106 390 144 368 170 C360 194 332 204 308 196 C292 206 262 214 232 208 C210 206 196 202 184 200 C160 208 128 206 112 192 C92 192 74 186 64 176 Z";
  const cerebellum = "M262 206 C284 198 326 200 340 216 C338 240 300 252 274 242 C258 232 256 214 262 206 Z";
  const stem = "M214 206 C220 232 226 256 230 286 L204 286 C200 258 196 232 192 204 Z";
  const lines: string[] = [];
  for (let y = 64; y <= 192; y += 20) lines.push(`M30 ${y} C130 ${y - 16}, 260 ${y + 12}, 400 ${y - 8}`);
  const meridians: string[] = [];
  for (let x = 70; x <= 370; x += 30) meridians.push(`M${x} 20 C${x + 18} 90, ${x - 14} 150, ${x + 8} 224`);
  const sulci = [
    "M118 152 C170 138 222 142 276 118",
    "M206 40 C202 80 218 112 232 134",
    "M92 112 C130 100 150 118 190 104",
    "M262 70 C290 84 312 78 340 100",
    "M130 190 C160 168 200 172 236 192",
    "M290 150 C318 144 344 156 362 140",
  ];
  const nodes: Array<[number, number]> = [[118, 152], [206, 40], [232, 134], [276, 118], [92, 112], [190, 104], [340, 100], [236, 192], [150, 70], [300, 60], [250, 170], [330, 130], [78, 150]];
  return (
    <svg className={className} viewBox="0 0 420 290" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={`cb-${clip}`}>
          <path d={cerebrum} />
        </clipPath>
        <linearGradient id={`bg-${clip}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff2a6d" stopOpacity="0.16" />
          <stop offset="1" stopColor="#b967ff" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {glow && (
        // static halo made of two wide, faint strokes: same look as the old double drop-shadow filter, no filter pass to rasterise
        <g stroke="#ff2a6d" strokeLinejoin="round" fill="none" vectorEffect="non-scaling-stroke">
          <path d={cerebrum} strokeWidth="14" strokeOpacity="0.1" vectorEffect="non-scaling-stroke" />
          <path d={cerebrum} strokeWidth="7" strokeOpacity="0.2" vectorEffect="non-scaling-stroke" />
          <path d={cerebellum} strokeWidth="9" strokeOpacity="0.14" vectorEffect="non-scaling-stroke" />
        </g>
      )}
      <g>
        <path d={cerebrum} fill={`url(#bg-${clip})`} stroke="#ff2a6d" strokeWidth="2.4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={cerebellum} fill="rgba(185,103,255,0.1)" stroke="#ff2a6d" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={stem} fill="rgba(185,103,255,0.1)" stroke="#ff2a6d" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </g>
      <g clipPath={`url(#cb-${clip})`} stroke="#05d9e8" strokeOpacity="0.42" strokeWidth="1" vectorEffect="non-scaling-stroke">
        {lines.map((d) => (
          <path key={d} d={d} vectorEffect="non-scaling-stroke" />
        ))}
        {meridians.map((d) => (
          <path key={d} d={d} stroke="#b967ff" strokeOpacity="0.5" vectorEffect="non-scaling-stroke" />
        ))}
      </g>
      <g clipPath={`url(#cb-${clip})`} stroke="#ff2a6d" strokeOpacity="0.9" strokeWidth="1.6" strokeLinecap="round">
        {sulci.map((d) => (
          <path key={d} d={d} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
      <g fill="#fffb96">
        {nodes.map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="2.2" opacity="0.9" />
        ))}
      </g>
      <g stroke="#05d9e8" strokeOpacity="0.4" strokeWidth="1" vectorEffect="non-scaling-stroke">
        <path d="M284 214 C300 222 322 224 334 218" vectorEffect="non-scaling-stroke" />
        <path d="M276 228 C296 238 318 238 330 230" vectorEffect="non-scaling-stroke" />
        <path d="M200 226 L224 226 M202 250 L226 250 M204 270 L228 270" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}

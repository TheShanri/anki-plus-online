import { BackdropPause } from "./BackdropPause";
import { BrainSvg } from "./BrainSvg";

const HLINES = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const MOTES = [8, 19, 27, 38, 47, 58, 66, 74, 83, 92];

/** The fixed background for all three themes. CSS (src/styles/backdrop.css) shows only the active theme's scene.
 * Server component: static markup, animations are transform/opacity only. */
export function Backdrop() {
  return (
    <div className="bg-scene" aria-hidden>
      <BackdropPause />
      <div className="scene scene-clinical">
        <div className="wash deco" />
      </div>
      <div className="scene scene-academia">
        <div className="room" />
        <div className="shelf shelf-l deco" />
        <div className="shelf shelf-r deco" />
        <div className="candle candle-a deco anim" />
        <div className="candle candle-b deco anim" />
        {MOTES.map((left, i) => (
          <span key={left} className="mote deco anim" style={{ left: `${left}%`, bottom: `${6 + (i % 4) * 7}%`, animationDelay: `${-i * 1.7}s`, animationDuration: `${13 + (i % 5) * 2.2}s` }} />
        ))}
        <div className="grain deco" />
      </div>
      <div className="scene scene-synth">
        <div className="sky" />
        <div className="stars deco" />
        <div className="halo deco" />
        <div className="brain">
          <BrainSvg />
        </div>
        <div className="ground">
          <div className="fan deco" />
          <div className="deco">
            {HLINES.map((n) => (
              <i key={n} className="hl anim" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

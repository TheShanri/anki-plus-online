"use client";
// The scaffolding toggles, shared by /settings/scaffolding and the gear popover on the study screen.
import { useState } from "react";
import { SCAFFOLD_DEFAULTS, type Scaffold, type ScaffoldKey } from "@/lib/study/settings";
import { setSoundsEnabled } from "@/lib/feedback/events";

export const SCAFFOLD_INFO: Array<{ key: ScaffoldKey; title: string; short: string; long: string }> = [
  { key: "hints", title: "Ghost-letter hints", short: "Hints", long: "If you pause or get stuck, the next letter of the answer appears faintly (Tab asks for one). Every hint lowers the rating of that review, so the schedule stays honest. Hints never reveal more than about half the answer." },
  { key: "ladder", title: "Scaffold ladder", short: "Ladder", long: "A new name starts as a first look: you copy it once. After that you type it from memory. If you miss it, the next time shows its first letters; miss again and you get the vowels to fill in. One clean pass and you are back to typing from memory." },
  { key: "traps", title: "Trap letters", short: "Trap letters", long: "ANKI PLUS learns where you personally slip (a doubled p in hippocampus, ae or e, ie or ei) and guards those spots next time: no hints there, a short pause, then you recall the spot from memory. Your patterns stay private to you." },
  { key: "boss", title: "Boss fights", short: "Boss fights", long: "Every ten or so cards, one of your hardest cards that is due anyway becomes a boss. Beat it with a clean, unaided answer. Nothing is served early." },
  { key: "theory", title: "Theory follow-ups", short: "Theory follow-ups", long: "Once a structure's name is solid (two clean recalls in a row, or remembered for 3+ days), a follow-up question about its function, connections or lesion is asked right after the name, like a lab practical station." },
  { key: "focus", title: "Focus helpers", short: "Focus helpers", long: "Short rounds with a finish line, a gentle catcher when your attention drifts (it pauses the clocks and hints, never scolds), a hyperfocus stop card after long runs, and the slow mode at trap letters." },
  { key: "sounds", title: "Sounds", short: "Sounds", long: "Short sound effects for right and wrong answers, combos and boss fights, in the style of your theme. Turn off for silent study." },
  { key: "readAloud", title: "Read answers aloud", short: "Read aloud", long: "As soon as you answer, a natural voice says the answer, with anatomy terms pronounced the way your professor does. Works with sound effects off too. Press P or the speaker button to hear it again." },
  { key: "streaks", title: "Streaks and activity grid", short: "Streaks", long: "Your own streak and a small calendar of the days you studied. Private: nobody sees it but you." },
  { key: "mnemonics", title: "Your own mnemonics", short: "Mnemonics", long: "After a card keeps slipping you are gently offered a place to write your own memory hook for it. Your hooks show up when the card comes back." },
];

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className="switch" onClick={() => onChange(!on)} />;
}

/** Saves one toggle (optimistically) and tells the caller the new full set. */
export function useScaffoldToggles(initial: Scaffold, onChanged?: (s: Scaffold) => void) {
  const [s, setS] = useState<Scaffold>(initial);
  const [err, setErr] = useState<string | null>(null);
  const toggle = async (key: ScaffoldKey, value: boolean) => {
    const next = { ...s, [key]: value };
    setS(next);
    if (key === "sounds") setSoundsEnabled(value);
    onChanged?.(next);
    try {
      const r = await fetch("/api/study/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scaffold: { [key]: value } }) });
      if (!r.ok) throw new Error("save failed");
      setErr(null);
    } catch {
      setErr("Could not save that change. Check your connection.");
    }
  };
  const reset = () => (Object.keys(SCAFFOLD_DEFAULTS) as ScaffoldKey[]).forEach((k) => void toggle(k, SCAFFOLD_DEFAULTS[k]));
  return { s, toggle, err, reset };
}

/** Small gear popover on the study screen. */
export function GearPopover({ scaffold, onChanged }: { scaffold: Scaffold; onChanged: (s: Scaffold) => void }) {
  const [open, setOpen] = useState(false);
  const { s, toggle, err } = useScaffoldToggles(scaffold, onChanged);
  return (
    <div className="st-gear">
      <button type="button" className="btn gear-btn" aria-label="Study supports" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {"⚙"}
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Study supports">
          {SCAFFOLD_INFO.map((i) => (
            <div key={i.key} className="toggle-row">
              <span>{i.short}</span>
              <Switch on={s[i.key]} onChange={(v) => void toggle(i.key, v)} label={i.title} />
            </div>
          ))}
          {err && <p className="field-error">{err}</p>}
          <a className="text-accent-2 text-sm" href="/settings/scaffolding">How your learning is scaffolded</a>
        </div>
      )}
    </div>
  );
}

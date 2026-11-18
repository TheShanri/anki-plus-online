// UVM Clinical: crisp, quiet, tactile. Soft clicks and gentle chimes, a good medical device.
// Short sine/triangle voices, tiny room, nothing punishing on a wrong answer.
import type { Pack, Payload, Voice } from "../engine";

const num = (p: Payload, k: string, d = 0) => (typeof p[k] === "number" ? (p[k] as number) : d);

/** a soft two-partial chime */
function chime(v: Voice, midiN: number, at: number, gain = 0.08, dur = 0.7) {
  const f = v.midi(midiN);
  v.note(f, at, dur, { type: "sine", gain, attack: 0.004, release: dur * 0.9, rev: 0.18 });
  v.note(f * 2.005, at, dur * 0.5, { type: "sine", gain: gain * 0.22, attack: 0.003, release: dur * 0.4, rev: 0.18 });
}
function tick(v: Voice, hz: number, gain = 0.05, at = v.now()) {
  v.note(hz, at, 0.05, { type: "sine", gain, attack: 0.001, release: 0.045, rev: 0.05 });
  v.noise(at, 0.018, { gain: gain * 0.6, from: 5200, to: 3800, q: 0.7, type: "highpass", rev: 0 });
}
function soft(v: Voice, midiN: number, at: number, gain = 0.1, dur = 0.28, to = 0) {
  v.note(v.midi(midiN), at, dur, { type: "triangle", gain, attack: 0.006, release: dur * 0.85, cutoff: 1400, rev: 0.08, glideTo: to ? v.midi(to) : 0 });
}

export const clinical: Pack = {
  key: (v, p) => tick(v, 1500 + num(p, "progress") * 900, 0.032),
  // a mistyped letter: a soft low double tick, never a buzzer
  typo: (v) => {
    const t = v.now();
    tick(v, 420, 0.05, t);
    tick(v, 360, 0.035, t + 0.045);
  },
  ui: (v) => tick(v, 1250, 0.045),
  card_in: (v) => v.noise(v.now(), 0.12, { gain: 0.012, from: 1500, to: 3200, q: 0.6, type: "bandpass", rev: 0.05, attack: 0.04 }),
  hint: (v) => {
    const t = v.now();
    chime(v, 84, t, 0.04, 0.3);
    chime(v, 80, t + 0.07, 0.03, 0.3);
  },
  correct: (v, p) => {
    const t = v.now();
    const up = Math.min(4, num(p, "combo") / 5) | 0;
    chime(v, 79 + up, t, 0.085, 0.55);
    chime(v, 86 + up, t + 0.075, 0.075, 0.7);
  },
  easy: (v) => {
    const t = v.now();
    [79, 83, 86, 91].forEach((m, i) => chime(v, m, t + i * 0.06, 0.07, 0.6));
  },
  near_miss: (v) => {
    const t = v.now();
    soft(v, 76, t, 0.09, 0.22);
    soft(v, 74, t + 0.1, 0.07, 0.3);
  },
  wrong: (v) => {
    const t = v.now();
    soft(v, 57, t, 0.12, 0.2, 54);
    soft(v, 52, t + 0.11, 0.1, 0.3, 50);
  },
  reveal: (v) => v.noise(v.now(), 0.16, { gain: 0.03, from: 700, to: 2200, q: 0.8, rev: 0.1, attack: 0.05 }),
  save: (v) => {
    const t = v.now();
    tick(v, 900, 0.06, t);
    chime(v, 88, t + 0.04, 0.045, 0.35);
  },
  combo: (v, p) => {
    const t = v.now();
    const lv = Math.max(1, Math.round(num(p, "combo", 5) / 5));
    [79, 83, 86, 91].slice(0, Math.min(4, lv + 1)).forEach((m, i) => chime(v, m, t + i * 0.07, 0.07, 0.6));
  },
  combo_break: (v) => {
    const t = v.now();
    soft(v, 67, t, 0.08, 0.3, 62);
  },
  boss_start: (v) => {
    const t = v.now();
    v.note(v.midi(48), t, 1.2, { type: "sine", gain: 0.1, attack: 0.25, release: 0.7, rev: 0.2 });
    v.note(v.midi(55), t + 0.05, 1.1, { type: "sine", gain: 0.07, attack: 0.25, release: 0.7, rev: 0.2 });
    chime(v, 79, t + 0.5, 0.06, 0.8);
  },
  boss_win: (v) => {
    const t = v.now();
    [72, 76, 79, 84, 88].forEach((m, i) => chime(v, m, t + i * 0.09, 0.075, 1));
  },
  boss_lose: (v) => {
    const t = v.now();
    soft(v, 64, t, 0.1, 0.4, 60);
    soft(v, 57, t + 0.18, 0.1, 0.55, 52);
  },
  trap_arm: (v) => chime(v, 91, v.now(), 0.045, 0.4),
  trap_guard: (v) => {
    const t = v.now();
    v.note(v.midi(52), t, 0.12, { type: "triangle", gain: 0.1, attack: 0.002, release: 0.1, cutoff: 800, rev: 0.05 });
    v.noise(t, 0.03, { gain: 0.04, from: 800, to: 500, q: 0.6, type: "lowpass", rev: 0 });
  },
  trap_clear: (v) => {
    const t = v.now();
    chime(v, 86, t, 0.07, 0.5);
    chime(v, 91, t + 0.06, 0.06, 0.6);
  },
  trap_miss: (v) => soft(v, 50, v.now(), 0.12, 0.3, 46),
  followup: (v) => {
    const t = v.now();
    chime(v, 81, t, 0.05, 0.35);
    chime(v, 84, t + 0.06, 0.05, 0.4);
  },
  ladder_up: (v) => {
    const t = v.now();
    chime(v, 79, t, 0.05, 0.4);
    chime(v, 84, t + 0.07, 0.05, 0.5);
  },
  ladder_down: (v) => {
    const t = v.now();
    chime(v, 84, t, 0.04, 0.35);
    chime(v, 79, t + 0.07, 0.04, 0.45);
  },
  drift: (v, p) => {
    const t = v.now();
    const lv = num(p, "level", 1);
    chime(v, 76, t, 0.05 + lv * 0.015, 0.8);
    chime(v, 71, t + 0.22, 0.05 + lv * 0.015, 0.9);
  },
  guard: (v) => {
    const t = v.now();
    v.note(v.midi(55), t, 1.2, { type: "sine", gain: 0.1, attack: 0.3, release: 0.7, rev: 0.2 });
    chime(v, 72, t + 0.4, 0.07, 1.2);
  },
  level_up: (v) => {
    const t = v.now();
    [72, 76, 79, 84, 88, 91].forEach((m, i) => chime(v, m, t + i * 0.075, 0.075, 1.1));
  },
  streak: (v) => {
    const t = v.now();
    [79, 84, 88].forEach((m, i) => chime(v, m, t + i * 0.08, 0.07, 0.8));
  },
  session_done: (v) => {
    const t = v.now();
    [72, 76, 79].forEach((m) => chime(v, m, t, 0.06, 1.6));
    chime(v, 84, t + 0.25, 0.06, 1.6);
  },
  practical_start: (v) => {
    const t = v.now();
    [0, 0.2, 0.4].forEach((d, i) => chime(v, i === 2 ? 91 : 84, t + d, 0.06, 0.4));
  },
  practical_tick: (v) => tick(v, 1000, 0.03),
  practical_end: (v) => {
    const t = v.now();
    chime(v, 84, t, 0.08, 0.9);
    chime(v, 79, t + 0.2, 0.08, 1.2);
  },
};

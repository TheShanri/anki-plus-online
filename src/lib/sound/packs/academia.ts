// Dark Academia: a candlelit library. Quill scratch, page turns, small bells, wood and a little organ.
import type { Pack, Payload, Voice } from "../engine";

const num = (p: Payload, k: string, d = 0) => (typeof p[k] === "number" ? (p[k] as number) : d);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function scratch(v: Voice, gain = 0.045) {
  const t = v.now();
  v.noise(t, 0.05, { gain, from: rnd(3800, 5200), to: rnd(2400, 3200), q: 3.5, rev: 0.05, attack: 0.006 });
}
function page(v: Voice, gain = 0.05, at = v.now()) {
  v.noise(at, 0.24, { gain, from: 900, to: 3600, q: 0.9, rev: 0.25, attack: 0.07 });
  v.noise(at + 0.1, 0.12, { gain: gain * 0.7, from: 2600, to: 1400, q: 1.2, rev: 0.2, attack: 0.02 });
}
function knock(v: Voice, hz: number, at: number, gain = 0.16) {
  v.note(hz, at, 0.16, { type: "sine", gain, attack: 0.002, release: 0.14, glideTo: hz * 0.66, rev: 0.2 });
  v.noise(at, 0.04, { gain: gain * 0.35, from: 900, to: 350, q: 0.8, type: "lowpass", rev: 0.1 });
}
function organ(v: Voice, midis: number[], at: number, dur: number, gain = 0.04) {
  midis.forEach((m) => v.note(v.midi(m), at, dur, { type: "triangle", gain, attack: 0.25, release: dur * 0.6, cutoff: 700, cutoffEnd: 1100, rev: 0.55 }));
}
const PENT = [72, 74, 76, 79, 81, 84, 86, 88, 91];

export const academia: Pack = {
  key: (v) => scratch(v),
  ui: (v) => {
    const t = v.now();
    v.note(540, t, 0.05, { type: "sine", gain: 0.06, attack: 0.001, release: 0.045, glideTo: 380, rev: 0.1 });
    v.noise(t, 0.015, { gain: 0.03, from: 2400, to: 1500, q: 1, rev: 0 });
  },
  card_in: (v) => page(v, 0.04),
  hint: (v) => v.bell(v.midi(96), v.now(), 0.035, 0.9),
  correct: (v, p) => {
    const t = v.now();
    const i = Math.min(4, Math.round(num(p, "combo") / 3));
    v.bell(v.midi(PENT[i]), t, 0.08, 1.4);
    v.bell(v.midi(PENT[i + 3]), t + 0.1, 0.06, 1.6);
  },
  easy: (v) => {
    const t = v.now();
    [76, 79, 84].forEach((m, i) => v.bell(v.midi(m), t + i * 0.09, 0.075, 1.5));
  },
  near_miss: (v) => {
    const t = v.now();
    v.bell(v.midi(71), t, 0.06, 0.9, { cutoff: 2400 });
    knock(v, 130, t + 0.02, 0.05);
  },
  wrong: (v) => {
    const t = v.now();
    knock(v, 118, t, 0.18);
    v.note(v.midi(51), t + 0.04, 0.4, { type: "triangle", gain: 0.05, attack: 0.02, release: 0.3, cutoff: 600, rev: 0.4 });
    v.note(v.midi(52), t + 0.04, 0.4, { type: "triangle", gain: 0.04, attack: 0.02, release: 0.3, cutoff: 600, rev: 0.4 });
  },
  reveal: (v) => page(v, 0.05),
  save: (v) => {
    const t = v.now();
    knock(v, 95, t, 0.15);
    v.bell(v.midi(84), t + 0.05, 0.04, 0.8);
  },
  combo: (v, p) => {
    const t = v.now();
    const lv = Math.max(1, Math.min(5, Math.round(num(p, "combo", 5) / 5)));
    for (let i = 0; i < lv + 2; i++) v.bell(v.midi(PENT[i]), t + i * 0.08, 0.065, 1.4);
  },
  combo_break: (v) => v.bell(v.midi(55), v.now(), 0.08, 2),
  boss_start: (v) => {
    const t = v.now();
    v.bell(v.midi(48), t, 0.16, 3.2);
    v.bell(v.midi(48), t + 0.9, 0.14, 3.2);
    organ(v, [43, 50, 55], t, 2.6, 0.05);
  },
  boss_win: (v) => {
    const t = v.now();
    [72, 76, 79, 84, 88, 91].forEach((m, i) => v.bell(v.midi(m), t + i * 0.1, 0.08, 2));
    organ(v, [48, 55, 60, 64], t, 3, 0.04);
  },
  boss_lose: (v) => {
    const t = v.now();
    v.bell(v.midi(43), t, 0.16, 3.5);
    knock(v, 80, t + 0.05, 0.14);
  },
  trap_arm: (v) => v.bell(v.midi(89), v.now(), 0.035, 0.7),
  trap_guard: (v) => knock(v, 150, v.now(), 0.1),
  trap_clear: (v) => {
    const t = v.now();
    v.bell(v.midi(86), t, 0.07, 1.2);
    v.bell(v.midi(93), t + 0.08, 0.05, 1.3);
  },
  trap_miss: (v) => {
    const t = v.now();
    knock(v, 105, t, 0.15);
    v.bell(v.midi(56), t + 0.03, 0.06, 1.4);
  },
  followup: (v) => {
    const t = v.now();
    page(v, 0.035, t);
    v.bell(v.midi(81), t + 0.18, 0.05, 1);
  },
  ladder_up: (v) => {
    const t = v.now();
    v.bell(v.midi(76), t, 0.05, 1);
    v.bell(v.midi(81), t + 0.09, 0.05, 1.1);
  },
  ladder_down: (v) => {
    const t = v.now();
    v.bell(v.midi(81), t, 0.045, 0.9);
    v.bell(v.midi(76), t + 0.09, 0.045, 1);
  },
  drift: (v, p) => v.bell(v.midi(64 - num(p, "level", 1)), v.now(), 0.09 + num(p, "level", 1) * 0.03, 2.4),
  guard: (v) => {
    const t = v.now();
    v.bell(v.midi(45), t, 0.17, 4);
    organ(v, [38, 45], t, 3, 0.05);
  },
  level_up: (v) => {
    const t = v.now();
    PENT.slice(0, 7).forEach((m, i) => v.bell(v.midi(m), t + i * 0.09, 0.07, 2));
    organ(v, [48, 55, 60, 64], t, 3.4, 0.045);
  },
  streak: (v) => {
    const t = v.now();
    [76, 81, 88].forEach((m, i) => v.bell(v.midi(m), t + i * 0.1, 0.07, 1.8));
  },
  session_done: (v) => {
    const t = v.now();
    organ(v, [48, 55, 60, 64, 67], t, 3.6, 0.045);
    v.bell(v.midi(84), t + 0.3, 0.07, 2.6);
    page(v, 0.03, t + 0.1);
  },
  practical_start: (v) => v.bell(v.midi(55), v.now(), 0.14, 3),
  practical_tick: (v) => {
    const t = v.now();
    v.note(720, t, 0.04, { type: "sine", gain: 0.05, attack: 0.001, release: 0.035, rev: 0.05 });
    v.noise(t, 0.012, { gain: 0.025, from: 1800, to: 1500, q: 1, rev: 0 });
  },
  practical_end: (v) => {
    const t = v.now();
    v.bell(v.midi(55), t, 0.15, 3);
    v.bell(v.midi(55), t + 0.7, 0.13, 3);
  },
};

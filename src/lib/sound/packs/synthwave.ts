// Synthwave Cortex: arcade blips, detuned-saw arpeggios, a long neon tail (feedback delay on most voices).
import type { Pack, Payload, Voice } from "../engine";

const num = (p: Payload, k: string, d = 0) => (typeof p[k] === "number" ? (p[k] as number) : d);
/** C-major pentatonic ladder used by key ticks and combos */
const LADDER = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96];

function blip(v: Voice, m: number, at: number, gain = 0.07, dur = 0.09) {
  v.note(v.midi(m), at, dur, { type: "square", gain, attack: 0.002, release: dur * 0.8, cutoff: 5200, rev: 0.12, del: 0.1 });
}
function lead(v: Voice, m: number, at: number, gain = 0.07, dur = 0.35) {
  v.note(v.midi(m), at, dur, { type: "sawtooth", gain, attack: 0.004, release: dur * 0.8, unison: 3, detune: 12, cutoff: 3400, cutoffEnd: 1400, rev: 0.3, del: 0.22 });
}
function pad(v: Voice, ms: number[], at: number, dur: number, gain = 0.045) {
  ms.forEach((m, i) =>
    v.note(v.midi(m), at, dur, { type: "sawtooth", gain, attack: 0.08, release: dur * 0.6, unison: 3, detune: 14, cutoff: 900, cutoffEnd: 2600, rev: 0.5, pan: i % 2 ? 0.25 : -0.25 }),
  );
}

export const synthwave: Pack = {
  key: (v, p) => blip(v, LADDER[Math.min(LADDER.length - 1, Math.floor(num(p, "progress") * (LADDER.length - 1)))], v.now(), 0.05, 0.06),
  ui: (v) => blip(v, 79, v.now(), 0.045, 0.05),
  card_in: (v) => v.noise(v.now(), 0.2, { gain: 0.03, from: 200, to: 2600, q: 1.2, rev: 0.2, attack: 0.08 }),
  hint: (v) => {
    const t = v.now();
    blip(v, 88, t, 0.04, 0.06);
    blip(v, 93, t + 0.05, 0.035, 0.08);
  },
  correct: (v, p) => {
    const t = v.now();
    const i = Math.min(8, num(p, "combo"));
    lead(v, LADDER[4 + (i % 4)], t, 0.07, 0.25);
    lead(v, LADDER[8 + (i % 4)], t + 0.07, 0.07, 0.4);
  },
  easy: (v) => {
    const t = v.now();
    [72, 76, 79, 84].forEach((m, i) => lead(v, m, t + i * 0.055, 0.07, 0.4));
  },
  near_miss: (v) => {
    const t = v.now();
    blip(v, 64, t, 0.07, 0.1);
    blip(v, 62, t + 0.09, 0.06, 0.16);
  },
  wrong: (v) => {
    const t = v.now();
    v.note(v.midi(57), t, 0.34, { type: "sawtooth", gain: 0.1, attack: 0.004, release: 0.2, glideTo: 70, cutoff: 1800, cutoffEnd: 300, rev: 0.2 });
    v.noise(t, 0.1, { gain: 0.05, from: 1200, to: 200, q: 1, rev: 0.1 });
  },
  reveal: (v) => v.noise(v.now(), 0.32, { gain: 0.07, from: 300, to: 5000, q: 1.5, rev: 0.4, attack: 0.1 }),
  save: (v) => {
    const t = v.now();
    blip(v, 83, t, 0.07, 0.07);
    blip(v, 88, t + 0.065, 0.07, 0.22);
  },
  combo: (v, p) => {
    const t = v.now();
    const lv = Math.max(1, Math.min(6, Math.round(num(p, "combo", 5) / 5)));
    for (let i = 0; i < 4 + lv; i++) lead(v, LADDER[Math.min(15, 4 + i)], t + i * 0.055, 0.06, 0.3);
  },
  combo_break: (v) => {
    v.note(v.midi(60), v.now(), 0.4, { type: "sawtooth", gain: 0.09, attack: 0.004, release: 0.3, glideTo: 55, cutoff: 1500, cutoffEnd: 250, rev: 0.3 });
  },
  boss_start: (v) => {
    const t = v.now();
    v.note(v.midi(45), t, 1, { type: "sawtooth", gain: 0.09, attack: 0.05, release: 0.4, glideTo: v.midi(69), cutoff: 600, cutoffEnd: 3000, rev: 0.4, unison: 3, detune: 20 });
    v.note(v.midi(33), t, 1.1, { type: "square", gain: 0.08, attack: 0.02, release: 0.5, cutoff: 400, rev: 0.1 });
    v.noise(t, 0.9, { gain: 0.06, from: 200, to: 6000, q: 1.2, rev: 0.4, attack: 0.5 });
  },
  boss_win: (v) => {
    const t = v.now();
    [72, 76, 79, 84, 88, 91, 96].forEach((m, i) => lead(v, m, t + i * 0.07, 0.07, 0.6));
    pad(v, [60, 64, 67, 72], t, 2.2);
  },
  boss_lose: (v) => {
    const t = v.now();
    [64, 60, 57, 52].forEach((m, i) => lead(v, m, t + i * 0.16, 0.08, 0.5));
  },
  trap_arm: (v) => {
    const t = v.now();
    blip(v, 91, t, 0.04, 0.05);
    blip(v, 91, t + 0.09, 0.04, 0.05);
  },
  trap_guard: (v) => {
    const t = v.now();
    v.note(v.midi(40), t, 0.14, { type: "square", gain: 0.1, attack: 0.002, release: 0.1, cutoff: 700, rev: 0.05 });
    v.noise(t, 0.05, { gain: 0.05, from: 1500, to: 400, q: 1, rev: 0 });
  },
  trap_clear: (v) => {
    const t = v.now();
    blip(v, 84, t, 0.07, 0.07);
    blip(v, 91, t + 0.06, 0.07, 0.25);
  },
  trap_miss: (v) => {
    const t = v.now();
    v.note(v.midi(45), t, 0.3, { type: "sawtooth", gain: 0.1, attack: 0.003, release: 0.25, glideTo: 50, cutoff: 900, rev: 0.2 });
    v.noise(t, 0.12, { gain: 0.06, from: 1800, to: 150, q: 1, rev: 0.1 });
  },
  followup: (v) => {
    const t = v.now();
    blip(v, 72, t, 0.05, 0.05);
    blip(v, 79, t + 0.05, 0.05, 0.05);
    blip(v, 84, t + 0.1, 0.05, 0.12);
  },
  ladder_up: (v) => {
    const t = v.now();
    [72, 76, 79].forEach((m, i) => lead(v, m, t + i * 0.05, 0.05, 0.25));
  },
  ladder_down: (v) => {
    const t = v.now();
    [79, 76, 72].forEach((m, i) => lead(v, m, t + i * 0.05, 0.045, 0.22));
  },
  drift: (v, p) => {
    const t = v.now();
    const lv = num(p, "level", 1);
    for (let i = 0; i < lv + 1; i++) v.note(v.midi(57), t + i * 0.18, 0.16, { type: "square", gain: 0.06, attack: 0.004, release: 0.1, cutoff: 1400, rev: 0.2, del: 0.2 });
  },
  guard: (v) => {
    const t = v.now();
    [0, 0.25, 0.5].forEach((d, i) => blip(v, i % 2 ? 69 : 76, t + d, 0.08, 0.2));
  },
  level_up: (v) => {
    const t = v.now();
    [60, 64, 67, 72, 76, 79, 84, 88, 91].forEach((m, i) => lead(v, m, t + i * 0.06, 0.065, 0.6));
    pad(v, [57, 60, 64, 69], t, 2.6);
  },
  streak: (v) => {
    const t = v.now();
    [72, 76, 79, 84].forEach((m, i) => lead(v, m, t + i * 0.07, 0.065, 0.5));
  },
  session_done: (v) => {
    const t = v.now();
    pad(v, [57, 60, 64, 69], t, 2.4);
    [76, 79, 84, 88].forEach((m, i) => lead(v, m, t + 0.15 + i * 0.1, 0.06, 0.8));
  },
  practical_start: (v) => {
    const t = v.now();
    [0, 0.25, 0.5].forEach((d) => blip(v, 72, t + d, 0.07, 0.15));
    blip(v, 84, t + 0.75, 0.08, 0.4);
  },
  practical_tick: (v) => blip(v, 91, v.now(), 0.03, 0.03),
  practical_end: (v) => {
    const t = v.now();
    [84, 79, 72].forEach((m, i) => lead(v, m, t + i * 0.12, 0.07, 0.6));
  },
};

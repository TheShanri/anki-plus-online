// Optional generative ambient loops, one per theme (off by default; Settings > Advanced). Quiet by design:
// they sit under the study sounds and never repeat exactly.
import { registerAmbient, type AmbientApi } from "./engine";
import { midi } from "./engine";

function drone(api: AmbientApi, freqs: number[], gain: number, cutoff: number, type: OscillatorType = "sine") {
  const { ctx, bus } = api;
  const nodes: Array<OscillatorNode | AudioBufferSourceNode> = [];
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 4);
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = cutoff;
  g.connect(f);
  f.connect(bus);
  // slow swell
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lg = ctx.createGain();
  lg.gain.value = gain * 0.35;
  lfo.connect(lg);
  lg.connect(g.gain);
  lfo.start();
  nodes.push(lfo);
  freqs.forEach((fr, i) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = fr;
    o.detune.value = (i % 2 ? 1 : -1) * 5;
    o.connect(g);
    o.start();
    nodes.push(o);
  });
  return () => {
    const t = ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(0.0001, t, 0.4);
    setTimeout(() => {
      nodes.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } });
      g.disconnect();
    }, 2200);
  };
}

const PENT = [69, 72, 74, 76, 79, 81, 84];

/** UVM Clinical: a soft room tone with an occasional glassy chime */
registerAmbient("uvm-clinical", (api) => {
  const stop = drone(api, [midi(50), midi(57), midi(62)], 0.018, 500);
  let next = 0;
  api.every(1000, (t) => {
    if (t < next) return;
    next = t + 7 + Math.random() * 9;
    const m = PENT[Math.floor(Math.random() * PENT.length)];
    api.note(midi(m), t, 2.4, { type: "sine", gain: 0.02, attack: 0.02, release: 2.2, rev: 0.4 });
  });
  return stop;
});

/** Dark Academia: low hearth drone, fire crackle, a distant bell, a page turning now and then */
registerAmbient("dark-academia", (api) => {
  const stop = drone(api, [midi(38), midi(45), midi(50)], 0.022, 420, "triangle");
  let nextBell = api.ctx.currentTime + 12;
  api.every(220, (t) => {
    if (Math.random() < 0.35) api.noise(t, 0.03 + Math.random() * 0.05, { gain: 0.012 + Math.random() * 0.02, from: 2500 + Math.random() * 3000, to: 1800, q: 2, rev: 0.1, attack: 0.003 });
    if (t > nextBell) {
      nextBell = t + 25 + Math.random() * 30;
      api.bell(midi(PENT[Math.floor(Math.random() * 4)] - 12), t, 0.03, 4);
    }
  });
  return stop;
});

/** Synthwave Cortex: slow Am-F-C-G pulse, soft saw pad and a sub arpeggio */
registerAmbient("synthwave-cortex", (api) => {
  const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  const bass = [33, 29, 36, 31];
  let step = 0;
  const beat = 60 / 84;
  api.every(beat * 1000, (t) => {
    const bar = Math.floor(step / 8) % 4;
    const s = step % 8;
    if (s === 0) chords[bar].forEach((m, i) => api.note(midi(m), t, beat * 8, { type: "sawtooth", gain: 0.012, attack: 1.2, release: 3, unison: 3, detune: 12, cutoff: 800, cutoffEnd: 1600, rev: 0.5, pan: i - 1 ? 0.3 : -0.3 }));
    api.note(midi(bass[bar] + (s % 4 === 2 ? 12 : 0)), t, beat * 0.9, { type: "sawtooth", gain: 0.03, attack: 0.01, release: 0.2, cutoff: 360, cutoffEnd: 200, rev: 0.05 });
    if (s % 2 === 1) api.note(midi(chords[bar][(s >> 1) % 3] + 24), t, beat * 0.6, { type: "square", gain: 0.008, attack: 0.005, release: 0.4, cutoff: 2400, rev: 0.3, del: 0.3 });
    step++;
  });
  return () => { step = 0; };
});

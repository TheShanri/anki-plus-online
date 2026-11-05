// One Web Audio engine for the whole app. Every sound is synthesised live (no audio files).
// Signal chain: voices -> dry bus + reverb send (+ feedback-delay send) -> compressor -> master -> speakers.
// Rules: nothing plays before the first user gesture, never in a hidden tab, never when sounds are off
// or the volume is 0. The theme's pack (src/lib/sound/packs/*) maps feedback events to sounds.
import type { ThemeId } from "../theme/themes";

export type Payload = Record<string, unknown>;

export interface NoteOpts {
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  release?: number;
  unison?: number;
  detune?: number;
  cutoff?: number;
  cutoffEnd?: number;
  q?: number;
  rev?: number;
  del?: number;
  glideTo?: number;
  pan?: number;
}
export interface NoiseOpts {
  gain?: number;
  from?: number;
  to?: number;
  q?: number;
  type?: BiquadFilterType;
  rev?: number;
  attack?: number;
  pan?: number;
}

/** What a sound pack gets: schedule notes relative to "now". */
export interface Voice {
  note(freq: number, at: number, dur: number, o?: NoteOpts): void;
  noise(at: number, dur: number, o?: NoiseOpts): void;
  /** a bell: fundamental + inharmonic partials */
  bell(freq: number, at: number, gain?: number, dur?: number, o?: NoteOpts): void;
  midi(n: number): number;
  /** audio-clock time to schedule from */
  now(): number;
}
export type Pack = Record<string, ((v: Voice, p: Payload) => void) | undefined>;

export const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

interface Config {
  enabled: boolean;
  volume: number;
  theme: ThemeId;
  ambient: boolean;
}
const cfg: Config = { enabled: true, volume: 0.6, theme: "uvm-clinical", ambient: false };

let ctx: AudioContext | null = null;
let master: GainNode;
let comp: DynamicsCompressorNode;
let dry: GainNode;
let revSend: GainNode;
let delaySend: GainNode;
let ambBus: GainNode;
let noiseBuf: AudioBuffer;
let unlocked = false;
let revBuiltFor: ThemeId | null = null;
let convolver: ConvolverNode | null = null;
const lastPlay = new Map<string, number>();

type Packs = Partial<Record<ThemeId, Pack>>;
const packs: Packs = {};
export function registerPack(id: ThemeId, p: Pack) {
  packs[id] = p;
}

// ---------------------------------------------------------------- context
function ensure(): AudioContext | null {
  if (ctx || typeof window === "undefined") return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC({ latencyHint: "interactive" });
  master = ctx.createGain();
  master.gain.value = cfg.volume;
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 20;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  comp.connect(master);
  master.connect(ctx.destination);
  dry = ctx.createGain();
  dry.connect(comp);

  convolver = ctx.createConvolver();
  const revOut = ctx.createGain();
  revOut.gain.value = 0.5;
  const revHp = ctx.createBiquadFilter();
  revHp.type = "highpass";
  revHp.frequency.value = 220;
  revSend = ctx.createGain();
  revSend.connect(revHp);
  revHp.connect(convolver);
  convolver.connect(revOut);
  revOut.connect(comp);

  delaySend = ctx.createGain();
  const dl = ctx.createDelay(1.5);
  dl.delayTime.value = 0.27;
  const dr = ctx.createDelay(1.5);
  dr.delayTime.value = 0.405;
  const fb = ctx.createGain();
  fb.gain.value = 0.3;
  const dlp = ctx.createBiquadFilter();
  dlp.type = "lowpass";
  dlp.frequency.value = 3200;
  const merger = ctx.createChannelMerger(2);
  const dOut = ctx.createGain();
  dOut.gain.value = 0.35;
  delaySend.connect(dl);
  dl.connect(dlp);
  dlp.connect(dr);
  dr.connect(fb);
  fb.connect(dl);
  dl.connect(merger, 0, 0);
  dr.connect(merger, 0, 1);
  merger.connect(dOut);
  dOut.connect(comp);

  ambBus = ctx.createGain();
  ambBus.gain.value = 0.5;
  ambBus.connect(comp);

  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  buildReverb();
  return ctx;
}

/** Room character per theme: clinical = tiny and dry, academia = a stone library, synthwave = a long neon tail. */
const REVERB: Record<ThemeId, { sec: number; decay: number }> = {
  "uvm-clinical": { sec: 0.6, decay: 4 },
  "dark-academia": { sec: 2.4, decay: 3 },
  "synthwave-cortex": { sec: 2.0, decay: 3.2 },
};
function buildReverb() {
  if (!ctx || !convolver || revBuiltFor === cfg.theme) return;
  const { sec, decay } = REVERB[cfg.theme];
  const len = Math.floor(ctx.sampleRate * sec);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < 600 ? i / 600 : 1);
    }
  }
  convolver.buffer = ir;
  revBuiltFor = cfg.theme;
}

function out(node: AudioNode, rev: number, del: number) {
  node.connect(dry);
  if (rev > 0) {
    const g = ctx!.createGain();
    g.gain.value = rev;
    node.connect(g);
    g.connect(revSend);
  }
  if (del > 0) {
    const g = ctx!.createGain();
    g.gain.value = del;
    node.connect(g);
    g.connect(delaySend);
  }
}

// ---------------------------------------------------------------- primitives
function note(freq: number, t: number, dur: number, o: NoteOpts = {}, dest?: AudioNode) {
  const c = ctx!;
  const { type = "sine", gain = 0.2, attack = 0.005, release = 0.25, unison = 1, detune = 8, cutoff = 0, cutoffEnd = 0, q = 1, rev = 0.2, del = 0, glideTo = 0, pan = 0 } = o;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), t + attack);
  g.gain.setValueAtTime(Math.max(gain, 0.0002), t + Math.max(attack, dur - release));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let head: AudioNode = g;
  if (cutoff) {
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = q;
    f.frequency.setValueAtTime(cutoff, t);
    if (cutoffEnd) f.frequency.exponentialRampToValueAtTime(cutoffEnd, t + dur);
    g.connect(f);
    head = f;
  }
  if (pan && c.createStereoPanner) {
    const p = c.createStereoPanner();
    p.pan.value = pan;
    head.connect(p);
    head = p;
  }
  if (dest) head.connect(dest);
  else out(head, rev, del);
  for (let i = 0; i < unison; i++) {
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur * 0.9);
    osc.detune.value = unison > 1 ? (i / (unison - 1) - 0.5) * 2 * detune : 0;
    const og = c.createGain();
    og.gain.value = 1 / Math.sqrt(unison);
    osc.connect(og);
    og.connect(g);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}

function noise(t: number, dur: number, o: NoiseOpts = {}, dest?: AudioNode) {
  const c = ctx!;
  const { gain = 0.1, from = 400, to = 4000, q = 2, type = "bandpass", rev = 0.15, attack = 0.01, pan = 0 } = o;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(to, 20), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  let head: AudioNode = g;
  if (pan && c.createStereoPanner) {
    const p = c.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    head = p;
  }
  if (dest) head.connect(dest);
  else out(head, rev, 0);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}

function bell(freq: number, t: number, gain = 0.1, dur = 1.2, o: NoteOpts = {}) {
  note(freq, t, dur, { gain, attack: 0.003, release: dur * 0.9, rev: 0.4, ...o });
  note(freq * 2.0, t, dur * 0.6, { gain: gain * 0.35, attack: 0.002, release: dur * 0.5, rev: 0.45 });
  note(freq * 2.76, t, dur * 0.35, { gain: gain * 0.15, attack: 0.002, release: dur * 0.3, rev: 0.45 });
  note(freq * 5.4, t, dur * 0.18, { gain: gain * 0.06, attack: 0.002, release: dur * 0.15, rev: 0.4 });
}

const voice: Voice = {
  note: (f, at, d, o) => note(f, at, d, o),
  noise: (at, d, o) => noise(at, d, o),
  bell,
  midi,
  now: () => (ctx?.currentTime ?? 0) + 0.005,
};

// ---------------------------------------------------------------- gating
function canPlay(): boolean {
  return cfg.enabled && cfg.volume > 0 && unlocked && typeof document !== "undefined" && document.visibilityState === "visible";
}

const MIN_GAP: Record<string, number> = { key: 28, ui: 40, hint: 60, practical_tick: 400 };

/** Play the active theme's sound for an event (called by the feedback-bus subscriber and by previews). */
export function play(name: string, payload: Payload = {}, opts: { force?: boolean; theme?: ThemeId } = {}): void {
  if (!opts.force && !canPlay()) return;
  if (opts.force && (!unlocked || cfg.volume <= 0 || document.visibilityState !== "visible")) return;
  const c = ensure();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  const now = performance.now();
  const gap = MIN_GAP[name] ?? 30;
  const key = (opts.theme ?? "") + name;
  if (now - (lastPlay.get(key) ?? -1e9) < gap) return;
  lastPlay.set(key, now);
  const fn = packs[opts.theme ?? cfg.theme]?.[name];
  if (!fn) return;
  try {
    fn(voice, payload);
  } catch (e) {
    /* a bad sound must never break study (the bug reporter keeps the console line) */
    console.warn("sound", name, e);
  }
}

/** Preview helper for the settings page: a short sequence in a given theme's pack (even if sounds are off). */
export function previewTheme(id: ThemeId): void {
  if (!unlocked) return;
  const seq: Array<[string, Payload, number]> = [["ui", { name: "click" }, 0], ["correct", { combo: 0 }, 240], ["combo", { combo: 5 }, 760]];
  for (const [n, p, ms] of seq) setTimeout(() => play(n, p, { force: true, theme: id }), ms);
}

// ---------------------------------------------------------------- configuration
export function configure(next: Partial<Config>): void {
  const themeChanged = next.theme !== undefined && next.theme !== cfg.theme;
  Object.assign(cfg, next);
  if (ctx) {
    master.gain.setTargetAtTime(cfg.volume, ctx.currentTime, 0.03);
    if (themeChanged) buildReverb();
  }
  syncAmbient(themeChanged);
}

/** Install the first-gesture unlock and the hidden-tab guard. Returns a cleanup. */
export function installUnlock(): () => void {
  const unlock = () => {
    unlocked = true;
    const c = ensure();
    if (c && c.state === "suspended") void c.resume();
    syncAmbient(false);
  };
  const onVis = () => {
    if (!ctx) return;
    if (document.visibilityState === "hidden") void ctx.suspend();
    else if (unlocked && cfg.enabled) void ctx.resume();
  };
  const evs = ["pointerdown", "keydown", "touchstart"] as const;
  evs.forEach((e) => window.addEventListener(e, unlock, { capture: true, passive: true }));
  document.addEventListener("visibilitychange", onVis);
  return () => {
    evs.forEach((e) => window.removeEventListener(e, unlock, { capture: true }));
    document.removeEventListener("visibilitychange", onVis);
    stopAmbient();
  };
}

export function debugState() {
  return { unlocked, ctx: ctx?.state ?? null, enabled: cfg.enabled, volume: cfg.volume, theme: cfg.theme };
}

export function isUnlocked(): boolean {
  return unlocked;
}

// ---------------------------------------------------------------- ambient (optional generative loop)
type AmbientFactory = (api: AmbientApi) => () => void;
export interface AmbientApi {
  ctx: AudioContext;
  bus: GainNode;
  note: (f: number, t: number, d: number, o?: NoteOpts) => void;
  noise: (t: number, d: number, o?: NoiseOpts) => void;
  bell: (f: number, t: number, g?: number, d?: number, o?: NoteOpts) => void;
  /** call fn every `ms` while the tab is visible and the context runs */
  every: (ms: number, fn: (t: number) => void) => void;
}
const ambients: Partial<Record<ThemeId, AmbientFactory>> = {};
export function registerAmbient(id: ThemeId, f: AmbientFactory) {
  ambients[id] = f;
}
let ambientStop: (() => void) | null = null;
let ambientTheme: ThemeId | null = null;

function stopAmbient() {
  ambientStop?.();
  ambientStop = null;
  ambientTheme = null;
}
function syncAmbient(themeChanged: boolean) {
  const want = cfg.ambient && cfg.enabled && cfg.volume > 0 && unlocked;
  if (!want) return stopAmbient();
  if (ambientStop && ambientTheme === cfg.theme && !themeChanged) return;
  stopAmbient();
  const c = ensure();
  const f = ambients[cfg.theme];
  if (!c || !f) return;
  const timers: number[] = [];
  const api: AmbientApi = {
    ctx: c,
    bus: ambBus,
    note: (fr, t, d, o) => note(fr, t, d, o, ambBus),
    noise: (t, d, o) => noise(t, d, o, ambBus),
    bell: (fr, t, g = 0.05, d = 3, o = {}) => bell(fr, t, g, d, { ...o }),
    every: (ms, fn) => {
      const id = window.setInterval(() => {
        if (document.visibilityState === "visible" && c.state === "running") fn(c.currentTime + 0.05);
      }, ms);
      timers.push(id);
    },
  };
  const stopFactory = f(api);
  ambientTheme = cfg.theme;
  ambientStop = () => {
    timers.forEach((id) => window.clearInterval(id));
    stopFactory();
  };
}

"use client";
// Combo bursts and milestone effects. DOM particles animated with the Web Animations API (transform + opacity only,
// compositor-driven), capped in number, skipped when effects are off or the OS asks for reduced motion.
import { useEffect, useRef } from "react";
import { onFeedback, type FeedbackName } from "@/lib/feedback/events";
import { useTheme } from "./ThemeProvider";

const SYNTH = ["#ff2a6d", "#05d9e8", "#fffb96", "#b967ff", "#ff9e3d"];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function origin(): { x: number; y: number } {
  const a = document.activeElement as HTMLElement | null;
  const r = a && a !== document.body ? a.getBoundingClientRect() : null;
  if (r && r.width > 0 && r.top >= 0 && r.top < window.innerHeight) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  return { x: window.innerWidth / 2, y: window.innerHeight * 0.42 };
}

export function FxLayer() {
  const { prefs } = useTheme();
  const root = useRef<HTMLDivElement>(null);
  const live = useRef(0);
  const cfg = useRef(prefs);
  useEffect(() => {
    cfg.current = prefs;
  }, [prefs]);

  useEffect(() => {
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const spawn = (kind: "small" | "big") => {
      const { theme, effects } = cfg.current;
      const el = root.current;
      if (!el || effects === "off" || rm.matches || document.visibilityState !== "visible" || live.current > 40) return;
      const scale = effects === "subtle" ? 0.5 : 1;
      const o = origin();
      const add = (node: HTMLElement, frames: Keyframe[], opt: KeyframeAnimationOptions) => {
        node.className = "fx-p";
        node.style.left = `${o.x}px`;
        node.style.top = `${o.y}px`;
        el.appendChild(node);
        live.current++;
        const a = node.animate(frames, { fill: "forwards", ...opt });
        const done = () => {
          node.remove();
          live.current--;
        };
        a.onfinish = done;
        a.oncancel = done;
      };
      if (theme === "synthwave-cortex") {
        const n = Math.round((kind === "big" ? 26 : 12) * scale);
        for (let i = 0; i < n; i++) {
          const s = document.createElement("i");
          const c = SYNTH[i % SYNTH.length];
          const size = rnd(5, 10);
          Object.assign(s.style, { width: `${size}px`, height: `${size}px`, background: c, boxShadow: `0 0 8px ${c}`, borderRadius: i % 3 ? "1px" : "50%" });
          const ang = rnd(0, Math.PI * 2);
          const d = rnd(60, kind === "big" ? 230 : 130);
          const dx = Math.cos(ang) * d;
          const dy = Math.sin(ang) * d;
          add(
            s,
            [
              { transform: "translate(-50%,-50%) scale(1) rotate(0deg)", opacity: 1 },
              { transform: `translate(calc(${dx}px - 50%), calc(${dy + 40}px - 50%)) scale(0.2) rotate(${rnd(-240, 240)}deg)`, opacity: 0 },
            ],
            { duration: rnd(600, 1000), easing: "cubic-bezier(.15,.7,.3,1)" },
          );
        }
      } else if (theme === "dark-academia") {
        const n = Math.round((kind === "big" ? 18 : 8) * scale);
        for (let i = 0; i < n; i++) {
          const s = document.createElement("i");
          const size = rnd(3, 7);
          Object.assign(s.style, { width: `${size}px`, height: `${size}px`, borderRadius: "50%", background: "radial-gradient(circle, #f6e2ae, #c9a45c 60%, transparent 72%)" });
          const dx = rnd(-90, 90);
          add(
            s,
            [
              { transform: "translate(-50%,-50%) scale(0.6)", opacity: 0 },
              { transform: `translate(calc(${dx * 0.4}px - 50%), calc(${-rnd(20, 50)}px - 50%)) scale(1.1)`, opacity: 0.95, offset: 0.25 },
              { transform: `translate(calc(${dx}px - 50%), calc(${-rnd(90, 170)}px - 50%)) scale(0.5)`, opacity: 0 },
            ],
            { duration: rnd(1100, 1800), easing: "ease-out" },
          );
        }
      } else {
        const rings = kind === "big" ? 2 : 1;
        for (let i = 0; i < rings; i++) {
          const s = document.createElement("i");
          Object.assign(s.style, { width: "64px", height: "64px", borderRadius: "50%", border: `2px solid ${i ? "#ffd416" : "#1d6a4b"}`, boxSizing: "border-box" });
          add(
            s,
            [
              { transform: "translate(-50%,-50%) scale(0.3)", opacity: 0.7 },
              { transform: `translate(-50%,-50%) scale(${kind === "big" ? 3.4 : 2.2})`, opacity: 0 },
            ],
            { duration: 800, delay: i * 140, easing: "cubic-bezier(.16,1,.3,1)" },
          );
        }
      }
    };
    const offs: Array<() => void> = [];
    const small: FeedbackName[] = ["combo", "easy", "trap_clear"];
    const big: FeedbackName[] = ["level_up", "boss_win", "session_done", "streak"];
    small.forEach((n) => offs.push(onFeedback(n, () => spawn("small"))));
    big.forEach((n) => offs.push(onFeedback(n, () => spawn("big"))));
    return () => offs.forEach((f) => f());
  }, []);

  return <div ref={root} className="fx-layer" aria-hidden />;
}

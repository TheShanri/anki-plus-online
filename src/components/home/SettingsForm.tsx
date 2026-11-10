"use client";
import { Ban, BellRing, ChevronRight, Gauge, Monitor, Moon, Palette, Play, Sparkle, Sparkles, SlidersHorizontal, Sun, Target, Volume2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button, Segmented } from "@/components/ui";
import { previewTheme } from "@/lib/sound";
import { emit } from "@/lib/feedback/events";
import { ThemePicker } from "@/components/theme/ThemePicker";
import { useTheme } from "@/components/theme/ThemeProvider";
import { THEMES } from "@/lib/theme/themes";
import type { Effects, ModePref } from "@/lib/theme/prefs";

interface Props {
  retention: number;
  mnemonics: boolean;
  typingEnabled: boolean;
}

function Toggle({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <input id={id} type="checkbox" role="switch" className="switch" checked={checked} aria-label={label} onChange={(e) => onChange(e.target.checked)} />;
}

export function SettingsForm({ retention, mnemonics, typingEnabled }: Props) {
  const { prefs, update, saving, signedIn } = useTheme();
  const [ret, setRet] = useState(Math.round(retention * 100));
  const [mn, setMn] = useState(mnemonics);
  const [advState, setAdvState] = useState<"" | "saving" | "saved" | "error">("");
  const lastSample = useRef(0);

  async function patch(body: unknown) {
    setAdvState("saving");
    try {
      const r = await fetch("/api/study/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      setAdvState(r.ok ? "saved" : "error");
    } catch {
      setAdvState("error");
    }
  }

  const state = advState === "saving" || saving === "saving" ? "saving" : advState === "error" || saving === "error" ? "error" : advState === "saved" || saving === "saved" ? "saved" : "";
  const sample = () => {
    const now = Date.now();
    if (now - lastSample.current < 250) return;
    lastSample.current = now;
    previewTheme(prefs.theme);
  };

  return (
    <div className="w-full">
      <p className="save-state" data-s={state} role="status" aria-live="polite">
        {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state === "error" ? "Could not save. Your change is applied on this device." : signedIn ? "Changes save automatically." : "Changes are saved on this device."}
      </p>

      <section className="panel set-group" aria-labelledby="basics-h">
        <h2 id="basics-h"><SlidersHorizontal aria-hidden />Basics</h2>
        <p className="hint">Look, sound and your daily target. Each look has its own colours, type and sounds.</p>

        <div className="row row-stack">
          <div className="row-lead">
            <span className="row-ico"><Palette aria-hidden /></span>
            <div className="row-main">
              <b>Theme</b>
              <span>Currently {THEMES[prefs.theme].name}. Pick one to switch the whole app.</span>
            </div>
          </div>
          <ThemePicker />
        </div>

        {prefs.theme === "uvm-clinical" && (
          <div className="row">
            <div className="row-lead">
              <span className="row-ico"><Sun aria-hidden /></span>
              <div className="row-main">
                <b>UVM Clinical appearance</b>
                <span>Light, dark, or follow your device.</span>
              </div>
            </div>
            <div className="row-ctl">
              <Segmented<ModePref>
                label="Appearance"
                value={prefs.mode}
                onChange={(m) => update({ mode: m })}
                options={[
                  { value: "auto", label: "Auto", icon: Monitor },
                  { value: "light", label: "Light", icon: Sun },
                  { value: "dark", label: "Dark", icon: Moon },
                ]}
              />
            </div>
          </div>
        )}

        <div className="row">
          <div className="row-lead">
            <span className="row-ico"><BellRing aria-hidden /></span>
            <label className="row-main" htmlFor="sounds">
              <b>Sounds</b>
              <span>Key clicks, chimes and feedback while you study. Plays only in the open tab.</span>
            </label>
          </div>
          <div className="row-ctl">
            <Toggle id="sounds" checked={prefs.sounds} onChange={(v) => { update({ sounds: v }); if (v) emit("ui", { name: "toggle" }); }} label="Sounds" />
          </div>
        </div>

        <div className="row">
          <div className="row-lead">
            <span className="row-ico"><Volume2 aria-hidden /></span>
            <label className="row-main" htmlFor="volume">
              <b>Volume</b>
              <span>Master volume for every sound.</span>
            </label>
          </div>
          <div className="row-ctl">
            <div className="vol">
              <input id="volume" type="range" min={0} max={100} step={1} value={Math.round(prefs.volume * 100)} disabled={!prefs.sounds} onChange={(e) => update({ volume: Number(e.target.value) / 100 })} onPointerUp={sample} onKeyUp={sample} />
              <output htmlFor="volume">{Math.round(prefs.volume * 100)}%</output>
            </div>
            <Button size="sm" icon={Play} disabled={!prefs.sounds} onClick={() => previewTheme(prefs.theme)}>Test</Button>
          </div>
        </div>

        <div className="row">
          <div className="row-lead">
            <span className="row-ico"><Sparkles aria-hidden /></span>
            <div className="row-main">
              <b>Effects</b>
              <span>Background motion and combo bursts. Subtle is calmer; Off is fastest on a battery-saving laptop.</span>
            </div>
          </div>
          <div className="row-ctl">
            <Segmented<Effects>
              label="Effects"
              value={prefs.effects}
              onChange={(m) => update({ effects: m })}
              options={[
                { value: "full", label: "Full", icon: Sparkles },
                { value: "subtle", label: "Subtle", icon: Sparkle },
                { value: "off", label: "Off", icon: Ban },
              ]}
            />
          </div>
        </div>

        <div className="row">
          <div className="row-lead">
            <span className="row-ico"><Target aria-hidden /></span>
            <label className="row-main" htmlFor="goal">
              <b>Daily goal</b>
              <span>Reviews per day the ring on your home screen counts toward.</span>
            </label>
          </div>
          <div className="row-ctl">
            <input id="goal" className="input" type="number" min={5} max={500} step={5} value={prefs.dailyGoal} onChange={(e) => update({ dailyGoal: Math.max(5, Math.min(500, Math.round(Number(e.target.value) || 30))) })} />
          </div>
        </div>
      </section>

      {signedIn ? (
        <details className="panel adv">
          <summary>
            <Gauge aria-hidden className="adv-ico" />Advanced <small>retention, typing, mnemonics, ambient sound</small>
          </summary>
          <div className="adv-body">
            <div className="row">
              <label className="row-main" htmlFor="ret">
                <b>Desired retention</b>
                <span>How sure you want to be of a card when it comes back. 90% is the default; higher means more reviews.</span>
              </label>
              <div className="row-ctl">
                <input
                  id="ret"
                  className="input"
                  type="number"
                  min={70}
                  max={97}
                  value={ret}
                  onChange={(e) => setRet(Number(e.target.value))}
                  onBlur={() => {
                    const v = Math.max(70, Math.min(97, Math.round(ret || 90)));
                    setRet(v);
                    void patch({ study: { retention: v / 100 } });
                  }}
                />
                <span className="text-text-dim">%</span>
              </div>
            </div>

            <div className="row">
              <div className="row-main">
                <b>Typing mode</b>
                <span>{typingEnabled ? "Typing is on: you type every answer. This is the recommended way to learn for the practical." : "Typing is off: you recall, reveal and grade yourself."}</span>
              </div>
              <div className="row-ctl">
                <Button href="/settings/scaffolding#typing" size="sm" iconRight={ChevronRight}>{typingEnabled ? "Turn typing off…" : "Manage typing"}</Button>
              </div>
            </div>

            <div className="row">
              <label className="row-main" htmlFor="mn">
                <b>Your own mnemonics</b>
                <span>Offer to attach your own memory hook to a card after repeated misses.</span>
              </label>
              <div className="row-ctl">
                <Toggle id="mn" checked={mn} onChange={(v) => { setMn(v); void patch({ scaffold: { mnemonics: v } }); }} label="Mnemonics" />
              </div>
            </div>

            <div className="row">
              <label className="row-main" htmlFor="amb">
                <b>Ambient sound</b>
                <span>A quiet generative loop that matches your theme. Off by default; plays only while this tab is open.</span>
              </label>
              <div className="row-ctl">
                <Toggle id="amb" checked={prefs.ambient} onChange={(v) => update({ ambient: v })} label="Ambient sound" />
              </div>
            </div>

            <div className="row">
              <div className="row-main">
                <b>How your learning is scaffolded</b>
                <span>Hints, the scaffold ladder, trap letters, theory follow-ups and focus helpers, each with its own switch.</span>
              </div>
              <div className="row-ctl">
                <Button href="/settings/scaffolding" size="sm" iconRight={ChevronRight}>Open</Button>
              </div>
            </div>
          </div>
        </details>
      ) : (
        <p className="text-sm text-text-dim">Log in to change study settings.</p>
      )}
    </div>
  );
}

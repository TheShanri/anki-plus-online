"use client";
import { useState } from "react";
import type { LearnerSettings } from "@/lib/study/settings";
import { SCAFFOLD_INFO, Switch, useScaffoldToggles } from "./Scaffolds";
import "./study.css";

async function patch(body: unknown): Promise<boolean> {
  try {
    const r = await fetch("/api/study/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return r.ok;
  } catch {
    return false;
  }
}

export function ScaffoldingPanel({ initial }: { initial: LearnerSettings }) {
  const { s, toggle, err, reset } = useScaffoldToggles(initial.scaffold);
  const [typingOn, setTypingOn] = useState(initial.typing.enabled);
  const [warn, setWarn] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [newPerDay, setNewPerDay] = useState(initial.study.newPerDay);

  const setTyping = async (on: boolean) => {
    const ok = await patch({ typing: { enabled: on } });
    if (ok) setTypingOn(on);
    else setSaveErr("Could not save that change.");
    setWarn(false);
  };

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 760 }}>
      <p className="text-text-dim">
        These supports are here to help you learn the names and the spelling the lab practical asks for. Each one is on or off for you alone, and you can also flip them from the gear on the study screen.
      </p>
      {SCAFFOLD_INFO.map((i) => (
        <div key={i.key} className="panel">
          <div className="toggle-row">
            <h2 className="font-display" style={{ fontSize: 15 }}>{i.title}</h2>
            <Switch on={s[i.key]} onChange={(v) => void toggle(i.key, v)} label={i.title} />
          </div>
          <p className="text-text-dim" style={{ marginTop: 6, lineHeight: 1.55 }}>{i.long}</p>
        </div>
      ))}
      {err && <p className="field-error">{err}</p>}
      <div className="btn-row"><button type="button" className="btn" onClick={reset}>Reset to the defaults</button></div>

      <details id="typing" className="panel" open={!typingOn}>
        <summary className="cursor-pointer font-display" style={{ fontSize: 15 }}>Advanced</summary>
        <div style={{ display: "grid", gap: 14, marginTop: 12 }}>
          <div>
            <div className="toggle-row">
              <h3 className="font-display" style={{ fontSize: 14 }}>Type every answer</h3>
              <Switch on={typingOn} onChange={(v) => (v ? void setTyping(true) : setWarn(true))} label="Type every answer" />
            </div>
            <p className="text-text-dim" style={{ marginTop: 6, lineHeight: 1.55 }}>
              Recommended: typing each answer trains the spelling the practical asks for. With it off, you answer in your head, reveal the answer and rate yourself (Again, Hard, Good, Easy), and the spelling supports above are skipped.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="npd">New cards per day</label>
            <input
              id="npd"
              className="input"
              type="number"
              min={0}
              max={100}
              value={newPerDay}
              style={{ maxWidth: 120 }}
              onChange={(e) => setNewPerDay(Number(e.target.value))}
              onBlur={() => void patch({ study: { newPerDay } })}
            />
          </div>
        </div>
      </details>
      {saveErr && <p className="field-error">{saveErr}</p>}

      {warn && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Turn typing off?">
          <div className="modal">
            <h2>Before you turn typing off</h2>
            <p>Typing the answer is a big part of why this works. Here is what you would give up:</p>
            <ul style={{ paddingLeft: 18, display: "grid", gap: 6 }}>
              <li><b>Retrieval.</b> Producing the answer yourself, rather than recognising it, is the strongest way to learn it (the generation effect).</li>
              <li><b>Consolidation.</b> Effortful recall is what tells your memory a fact is worth keeping.</li>
              <li><b>Spelling and the practical.</b> The practical is typed or written by hand. The link between remembering a word and producing its letters is built by doing it, and it can be weaker than it feels, which can cost points on practical day.</li>
            </ul>
            <p>You can switch it back on any time. We will check in gently once a week while it is off.</p>
            <div className="btn-row">
              <button type="button" className="btn btn-primary" onClick={() => setWarn(false)}>Keep typing on</button>
              <button type="button" className="btn" onClick={() => void setTyping(false)}>Turn typing off</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

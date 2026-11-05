import { PageShell } from "@/components/PageShell";

export default function SettingsPage() {
  return (
    <PageShell title="Settings" kicker="Account">
      <div className="panel max-w-xl space-y-4">
        <div>
          <p className="label">Theme</p>
          <p className="text-text-dim">Synthwave (a calmer clinical theme is planned).</p>
        </div>
        <div>
          <p className="label">Daily new cards</p>
          <input className="input" type="number" defaultValue={20} disabled />
        </div>
        <details className="rounded-card-sm border border-panel-border p-3">
          <summary className="cursor-pointer text-text-dim">Advanced</summary>
          <div className="mt-3 space-y-3">
            <div>
              <label className="label" htmlFor="retention">Desired retention</label>
              <input id="retention" className="input" type="number" step="0.01" min="0.7" max="0.97" defaultValue={0.9} disabled />
            </div>
            <p className="text-xs text-text-faint">FSRS tuning. Controls are not wired up yet.</p>
          </div>
        </details>
      </div>
    </PageShell>
  );
}

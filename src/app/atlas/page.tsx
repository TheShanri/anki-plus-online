import { PageShell } from "@/components/PageShell";

export default function AtlasPage() {
  return (
    <PageShell title="3D atlas" kicker="Atlas">
      <div
        className="panel flex items-center justify-center text-text-faint"
        style={{ height: "min(60vh, 520px)" }}
      >
        three / @react-three/fiber viewer goes here.
      </div>
    </PageShell>
  );
}

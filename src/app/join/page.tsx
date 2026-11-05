import { PageShell } from "@/components/PageShell";
import { JoinForm } from "./JoinForm";

export default function JoinPage() {
  return (
    <PageShell title="Join your course" kicker="Course code from your professor">
      <div className="panel max-w-xl">
        <JoinForm />
      </div>
    </PageShell>
  );
}

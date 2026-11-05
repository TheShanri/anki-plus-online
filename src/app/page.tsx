import Link from "next/link";
import { ConfigNotice } from "@/components/ConfigNotice";

export default function Home() {
  return (
    <div className="py-10">
      <ConfigNotice />
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent-2">Neuroanatomy, typed from memory</p>
      <h1 className="mt-3 font-display text-5xl leading-tight tracking-wide" style={{ textShadow: "var(--text-glow-accent)" }}>
        ANKI PLUS Online
      </h1>
      <p className="mt-5 max-w-xl text-lg text-text-dim">
        Type-the-answer flashcards for your anatomy course, scheduled with FSRS so you review each structure just
        before you would forget it. Your professor sees your progress and time on task.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/login" className="btn">Log in</Link>
        <Link href="/join" className="btn btn-primary">Join with course code</Link>
      </div>
    </div>
  );
}

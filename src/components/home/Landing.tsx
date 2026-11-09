import { ArrowRight, LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui";
import { ConfigNotice } from "@/components/ConfigNotice";
import { ThemePicker } from "@/components/theme/ThemePicker";

const FEATURES = [
  {
    title: "Type the answer",
    body: "Recall beats recognition. You type each structure the way the practical asks for it, with gentle hints that fade as you improve.",
    icon: <path d="M4 7h16M4 12h10M4 17h16" />,
  },
  {
    title: "Review at the right time",
    body: "FSRS spaces every card just before you would forget it, so a short session each day does the work of long cramming nights.",
    icon: <path d="M12 7v5l3 2M21 12a9 9 0 1 1-3-6.7" />,
  },
  {
    title: "Practice the practical",
    body: "Timed lab stations, pathway tracing and lesion logic, scored at the end. See your weak spots before the exam does.",
    icon: <path d="M5 4h14v16H5zM9 9h6M9 13h6M9 17h3" />,
  },
];

export function Landing() {
  return (
    <>
      <ConfigNotice />
      <section className="hero">
        <p className="eyebrow">Neuroanatomy, typed from memory</p>
        <h1 className="hero-title">
          Learn the brain <em>by heart</em>.
        </h1>
        <p className="hero-lead">
          Type-the-answer flashcards for your anatomy course, scheduled with spaced repetition. Built for the lab practical, open to everyone in your class from day one.
        </p>
        <div className="hero-cta">
          <Button href="/join" variant="primary" size="lg" icon={UserPlus} iconRight={ArrowRight}>Join with course code</Button>
          <Button href="/login" size="lg" icon={LogIn}>Log in</Button>
        </div>
        <p className="text-sm text-text-dim">Use your UVM email. Your instructors see progress summaries, never your individual answers.</p>
      </section>

      <section className="feature-grid" aria-label="What it does">
        {FEATURES.map((f) => (
          <div key={f.title} className="panel feature">
            <span className="feature-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{f.icon}</svg>
            </span>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </section>

      <section className="try-themes" aria-labelledby="try-h">
        <h2 id="try-h">Make it yours</h2>
        <p className="mb-4 text-text-dim">Three looks, each with its own sounds. Try them here; your choice is remembered.</p>
        <ThemePicker />
      </section>
    </>
  );
}

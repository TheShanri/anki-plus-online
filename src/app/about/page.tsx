import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { AtlasAttribution } from "@/components/atlas/AtlasAttribution";

export const metadata: Metadata = { title: "About, credits and privacy · ANKI PLUS Online" };

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="panel mb-5 scroll-mt-24 space-y-2 text-sm leading-relaxed text-text-dim">
      <h2 className="font-display text-lg text-text">{title}</h2>
      {children}
    </section>
  );
}

export default function AboutPage() {
  return (
    <PageShell title="About, credits and privacy" kicker="ANKI+ Online">
      <nav aria-label="On this page" className="mb-5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <a href="#supplementary">Supplementary notes</a>
        <a href="#credits">Credits</a>
        <a href="#privacy">Privacy</a>
        <a href="#not-medical">Not medical advice</a>
        <a href="#feedback">Feedback</a>
      </nav>

      <Section id="supplementary" title="Supplementary notes">
        <p>
          Where the info panel shows a section called <b>Supplementary</b> (name explanations, etymology, extra facts), that text is background
          written for this app. It is <b>not</b> taken from the course materials.
        </p>
        <p>
          It is there to make names and ideas easier to remember. Always check your lecture notes and lab handouts for what is actually
          examined: if the two ever differ, the course materials win. If you spot a mistake, please tell us (see Feedback below).
        </p>
      </Section>

      <Section id="credits" title="Credits and licences">
        <p>The 3D atlas is built on openly licensed anatomy models. Attribution is required by their licences, and it is gladly given.</p>
        <AtlasAttribution />
        <p>
          Course images and slides belong to the course instructors and are shown only to signed-in members of the course. The spaced
          repetition scheduler is <a href="https://github.com/open-spaced-repetition/ts-fsrs" target="_blank" rel="noopener noreferrer">ts-fsrs</a> (FSRS).
        </p>
      </Section>

      <Section id="privacy" title="Privacy: what is stored and who sees it">
        <p>
          <b>What is stored.</b> Your UVM email and name, the profile details you gave at signup (pronouns, class year, major, minor, lab section),
          your cards and review history (what you answered and when), study time (active minutes from the study screen), mock practical
          attempts, your settings, and any feedback you send.
        </p>
        <p>
          <b>Who sees what.</b> Only you can see your own answers and review history. Instructors and teaching assistants of your course see
          <b> per-student summaries only</b>: study time, sessions, number of cards reviewed, overall accuracy, streak, last seen, progress per
          unit and mock practical scores. They never see the individual answers you typed. Class-wide patterns (for example, which structures are
          missed most) are anonymous and appear only when at least three students have attempted something.
        </p>
        <p>
          The site administrator can manage accounts and read feedback. Feedback you send includes the page you were on and, for bug reports, a
          screenshot and a short technical log (never passwords). Nothing is sold or shared with advertisers, and there are no tracking cookies:
          the only cookies keep you signed in.
        </p>
        <p>To correct or delete your data, send us a note through Feedback or ask your instructor.</p>
      </Section>

      <Section id="not-medical" title="A study aid, not medical advice">
        <p>
          ANKI+ Online is a study aid for a university course. It is not a medical device and nothing in it is medical advice, diagnosis or
          guidance for treating anyone. Clinical examples are simplified for learning.
        </p>
      </Section>

      <Section id="feedback" title="Feedback">
        <p>
          The <b>Feedback</b> button at the bottom left of every page (or Alt+Shift+B) sends us a bug, a mistake in a card, an idea or a bit of
          praise. We attach the page you were on and, in study, the card, so we can find it quickly. You get a short confirmation email, and every
          message is read.
        </p>
        <p>
          <Link href="/study">Back to studying</Link>
        </p>
      </Section>
    </PageShell>
  );
}

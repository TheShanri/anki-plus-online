import { ConfigNotice } from "./ConfigNotice";

export function PageShell({
  title,
  kicker,
  children,
}: {
  title: string;
  kicker?: string;
  children?: React.ReactNode;
}) {
  return (
    <section>
      <ConfigNotice />
      {kicker && <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent-2">{kicker}</p>}
      <h1 className="mb-6 font-display text-3xl tracking-wide">{title}</h1>
      {children}
    </section>
  );
}

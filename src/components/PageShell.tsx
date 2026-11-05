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
      <header className="page-head">
        {kicker && <p className="eyebrow">{kicker}</p>}
        <h1 className="page-title">{title}</h1>
      </header>
      {children}
    </section>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";

export function HelpPageShell({
  kicker,
  title,
  lead,
  children,
}: {
  kicker: string;
  title: string;
  lead: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="help-page">
      <nav className="help-nav" aria-label="Help navigation">
        <Link href="/">← Back to the catalog</Link>
      </nav>
      <article className="help-content">
        <p className="help-kicker">{kicker}</p>
        <h1>{title}</h1>
        <div className="help-lead">{lead}</div>
        {children}
      </article>
    </main>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";

interface MenuPageShellProps {
  kicker: string;
  title: string;
  lead: ReactNode;
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
}

export function MenuPageShell({
  kicker,
  title,
  lead,
  children,
  backHref = "/menu/",
  backLabel = "← Back to Menu",
}: MenuPageShellProps) {
  return (
    <main className="help-page">
      <nav className="help-nav" aria-label="Menu navigation">
        <Link href={backHref}>{backLabel}</Link>
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

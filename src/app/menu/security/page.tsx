import Link from "next/link";

import { MenuPageShell } from "@/features/menu/components/menu-page-shell";

export const metadata = {
  title: "Private security reporting | Tavernary",
  description: "Report a Tavernary security vulnerability privately.",
};

export default function SecurityMenuPage() {
  return (
    <MenuPageShell
      kicker="Security"
      title="Report a security vulnerability privately"
      lead={
        <p>
          Use GitHub&apos;s private security reporting flow for Tavernary
          vulnerabilities. Do not include credentials or vulnerability details
          in a public issue.
        </p>
      }
    >
      <section className="help-security-callout">
        <h2>About TavernKeeper scan results</h2>
        <p>
          TavernKeeper scans one exact GitHub commit, and Tavernary publishes an
          automated contextual risk assessment. The color describes the reviewed
          evidence; a separate clock marker shows when that commit is older than
          Tavernary&apos;s latest repository refresh. Open the scan panel beside
          a project title for its summary, exact SHA, technical report, and
          assessment history.
        </p>
      </section>
      <section
        className="help-security-actions"
        aria-label="Private security reporting"
      >
        <a href="https://github.com/MentallyQuill/Tavernary/security/advisories/new">
          Open GitHub&apos;s private report form
        </a>
        <a href="https://github.com/MentallyQuill/Tavernary/security">
          Read the security policy
        </a>
        <Link href="/menu/report-project/">
          Report an unsafe listed project instead
        </Link>
      </section>
    </MenuPageShell>
  );
}

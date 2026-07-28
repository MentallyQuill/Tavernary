import Link from "next/link";

import { HelpPageShell } from "@/features/help/components/help-page-shell";

export const metadata = {
  title: "Private security reporting | Tavernary",
  description: "Report a Tavernary security vulnerability privately.",
};

export default function SecurityHelpPage() {
  return (
    <HelpPageShell
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
        <Link href="/help/report-project/">
          Report an unsafe listed project instead
        </Link>
      </section>
    </HelpPageShell>
  );
}

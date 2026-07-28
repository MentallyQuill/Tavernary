import { Suspense } from "react";

import { HelpPageShell } from "@/features/help/components/help-page-shell";
import { WebsiteReportForm } from "@/features/help/components/website-report-form";

export const metadata = {
  title: "Report a website problem | Tavernary",
  description:
    "Report a problem with Tavernary's website for maintainer review.",
};

export default function WebsiteReportPage() {
  const siteRevision =
    process.env.GITHUB_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local";

  return (
    <HelpPageShell
      kicker="Help"
      title="Report a website problem"
      lead={
        <p>
          Use this form for a Tavernary page, search, filter, link, form,
          accessibility, performance, or interaction problem.
        </p>
      }
    >
      <Suspense fallback={<p>Loading website report form…</p>}>
        <WebsiteReportForm siteRevision={siteRevision} />
      </Suspense>
    </HelpPageShell>
  );
}

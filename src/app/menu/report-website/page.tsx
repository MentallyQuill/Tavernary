import { Suspense } from "react";

import { WebsiteReportForm } from "@/features/help/components/website-report-form";
import { MenuPageShell } from "@/features/menu/components/menu-page-shell";

export const metadata = {
  title: "Report a website problem | Tavernary",
  description: "Report a problem with Tavernary's website for review.",
};

export default function WebsiteReportMenuPage() {
  const siteRevision =
    process.env.GITHUB_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local";

  return (
    <MenuPageShell
      kicker="Reports"
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
    </MenuPageShell>
  );
}

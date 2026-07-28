import { Suspense } from "react";
import Link from "next/link";

import { HelpPageShell } from "@/features/help/components/help-page-shell";
import {
  ProjectReportForm,
  type HelpProjectOption,
} from "@/features/help/components/project-report-form";
import { loadCatalog } from "@/lib/catalog/load-catalog";

interface CatalogProjectForHelpOption {
  id: string;
  name: string;
  canonicalUrl: string;
  searchableText: string;
  attribution: { owner: { login: string } } | null;
}

export function mapHelpProjectOptions(
  projects: readonly CatalogProjectForHelpOption[],
): HelpProjectOption[] {
  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    creator:
      project.attribution?.owner.login ??
      new URL(project.canonicalUrl).hostname,
    canonicalUrl: project.canonicalUrl,
    searchableText: project.searchableText,
  }));
}

export const metadata = {
  title: "Report a project listing | Tavernary",
  description: "Report information that needs review on a Tavernary listing.",
};

export default function ProjectReportPage() {
  const catalog = loadCatalog();
  const siteRevision =
    process.env.GITHUB_SHA?.slice(0, 120) ?? catalog.generatedAt;

  return (
    <HelpPageShell
      kicker="Help"
      title="Report a project listing"
      lead={
        <>
          <p>
            Use this form to report inaccurate, outdated, unsafe, abusive,
            duplicate, or rights-related information about a listed project.
          </p>
          <p>
            Are you an owner?{" "}
            <Link href="/help/manage-project/">
              Manage your project listing.
            </Link>
          </p>
          <p>
            A Tavernary vulnerability?{" "}
            <Link href="/help/security/">Report it privately.</Link>
          </p>
        </>
      }
    >
      <Suspense fallback={<p>Loading project report form…</p>}>
        <ProjectReportForm
          projects={mapHelpProjectOptions(catalog.projects)}
          siteRevision={siteRevision}
        />
      </Suspense>
    </HelpPageShell>
  );
}

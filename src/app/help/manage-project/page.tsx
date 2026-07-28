import { Suspense } from "react";
import Link from "next/link";

import capabilities from "../../../../data/vocabularies/capabilities.json";
import completionFormats from "../../../../data/vocabularies/completion-formats.json";
import frontends from "../../../../data/vocabularies/frontends.json";
import modelFamilies from "../../../../data/vocabularies/model-families.json";
import primaryFunctions from "../../../../data/vocabularies/primary-functions.json";
import { HelpPageShell } from "@/features/help/components/help-page-shell";
import { ProjectOwnerBuilder } from "@/features/help/components/project-owner-builder";
import { loadOwnerProjectOptions } from "@/lib/help/load-owner-project-options";

export const metadata = {
  title: "Manage your project listing | Tavernary",
  description:
    "Request an owner-authored card edit, repository move, or delisting.",
};

export default async function ManageProjectPage() {
  const projects = await loadOwnerProjectOptions();

  return (
    <HelpPageShell
      kicker="Help"
      title="Manage your project listing"
      lead={
        <>
          <p>
            Repository owners can request a card correction, update the current
            location of the same GitHub repository, or delist a project.
          </p>
          <p>
            Organization, external-source, and other listing concerns can still
            be reviewed through{" "}
            <Link href="/help/report-project/">Report a project listing</Link>.
          </p>
        </>
      }
    >
      <Suspense fallback={<p>Loading owner request form…</p>}>
        <ProjectOwnerBuilder
          projects={projects}
          vocabularies={{
            frontends: frontends.frontends,
            primaryFunctions: primaryFunctions.primary_functions,
            capabilities: capabilities.capabilities,
            modelFamilies: modelFamilies.model_families,
            completionFormats: completionFormats.completion_formats,
          }}
        />
      </Suspense>
    </HelpPageShell>
  );
}

import { Suspense } from "react";
import Link from "next/link";

import completionFormats from "../../../../data/vocabularies/completion-formats.json";
import frontends from "../../../../data/vocabularies/frontends.json";
import modelFamilies from "../../../../data/vocabularies/model-families.json";
import primaryFunctions from "../../../../data/vocabularies/primary-functions.json";
import tags from "../../../../data/vocabularies/tags.json";
import {
  publicTagVocabulary,
  tagVocabularyHash,
  type TagVocabulary,
} from "../../../../scripts/catalog/tag-vocabulary.mjs";
import { HelpPageShell } from "@/features/help/components/help-page-shell";
import { ProjectOwnerBuilder } from "@/features/help/components/project-owner-builder";
import { loadOwnerProjectOptions } from "@/lib/help/load-owner-project-options";

export const metadata = {
  title: "Manage your project listing | Tavernary",
  description:
    "Request card edits, additional cards, lifecycle maintenance, repository moves, or source delisting.",
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
            Repository owners can edit a card, propose additional cards from the
            same source, retire or restore one card, update a repository
            location, or permanently delist the repository source.
          </p>
          <p>
            Tavernary&apos;s owner can use this workflow for any catalog record.
            Other organization, external-source, and listing concerns can be
            reviewed through{" "}
            <Link href="/help/report-project/">Report a project listing</Link>.
          </p>
        </>
      }
    >
      <Suspense fallback={<p>Loading owner request form…</p>}>
        <ProjectOwnerBuilder
          projects={projects}
          tagVocabularyHash={tagVocabularyHash(tags as TagVocabulary)}
          vocabularies={{
            frontends: frontends.frontends,
            primaryFunctions: primaryFunctions.primary_functions,
            tags: publicTagVocabulary(tags as TagVocabulary),
            modelFamilies: modelFamilies.model_families,
            completionFormats: completionFormats.completion_formats,
          }}
        />
      </Suspense>
    </HelpPageShell>
  );
}

import Link from "next/link";

import tags from "../../../../data/vocabularies/tags.json";
import {
  publicTagVocabulary,
  type TagVocabulary,
} from "../../../../scripts/catalog/tag-vocabulary.mjs";
import {
  ProjectSubmissionBuilder,
  type SubmissionFrontendOption,
} from "@/features/submissions/components/project-submission-builder";
import { orderFrontendOptionsByPopularity } from "@/features/catalog/frontend-option-order";
import { loadCatalog } from "@/lib/catalog/load-catalog";

export const metadata = {
  title: "Submit a project | Tavernary",
  description: "Propose an AI roleplay project for the Tavernary catalog.",
};

export default function ProjectSubmissionPage() {
  const catalog = loadCatalog();
  const frontends: SubmissionFrontendOption[] =
    orderFrontendOptionsByPopularity(
      catalog.projects
        .filter((project) => project.kind === "frontend")
        .flatMap((project) => {
          const [selfCompatibility] = project.frontends;
          return selfCompatibility
            ? [
                {
                  id: selfCompatibility.id,
                  label: selfCompatibility.label,
                  canonicalUrl: project.canonicalUrl,
                },
              ]
            : [];
        }),
      catalog.projects,
    );

  return (
    <main className="submission-page">
      <nav className="submission-nav" aria-label="Submission navigation">
        <Link href="/">← Back to the catalog</Link>
      </nav>

      <article className="submission-content">
        <p className="submission-kicker">Contribute</p>
        <h1>Submit a project</h1>
        <p className="submission-lead">
          Describe the project and where it belongs. Tavernary validates the
          request and shows the authoritative submission for review before
          opening GitHub, where you can create the issue with your GitHub
          identity.
        </p>

        <ProjectSubmissionBuilder
          frontends={frontends}
          tagVocabulary={publicTagVocabulary(tags as TagVocabulary)}
        />
      </article>
    </main>
  );
}

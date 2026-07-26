import Link from "next/link";

import {
  ProjectSubmissionBuilder,
  type SubmissionFrontendOption,
} from "@/features/submissions/components/project-submission-builder";
import { loadCatalog } from "@/lib/catalog/load-catalog";

const fallbackUrl =
  "https://github.com/MentallyQuill/Tavernary/issues/new?template=01-project-submission.yml";

export const metadata = {
  title: "Submit a project | Tavernary",
  description: "Propose an AI roleplay project for the Tavernary catalog.",
};

export default function ProjectSubmissionPage() {
  const frontends: SubmissionFrontendOption[] = loadCatalog()
    .projects.filter((project) => project.kind === "frontend")
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
    })
    .sort((left, right) => left.label.localeCompare(right.label));

  return (
    <main className="submission-page">
      <nav className="submission-nav" aria-label="Submission navigation">
        <Link href="/">← Back to the catalog</Link>
      </nav>

      <article className="submission-content">
        <p className="submission-kicker">Contribute</p>
        <h1>Submit a project</h1>
        <p className="submission-lead">
          Tell us what the project is and where it belongs. Tavernary will
          prepare a GitHub issue for you to review before anything is sent.
        </p>

        <ProjectSubmissionBuilder frontends={frontends} />

        <p className="submission-fallback">
          Prefer GitHub&apos;s standard form?{" "}
          <a href={fallbackUrl}>Open the accessible fallback form.</a>
        </p>
      </article>
    </main>
  );
}

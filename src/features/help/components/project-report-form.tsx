"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import type {
  ProjectReportCategory,
  ProjectReportPayload,
} from "@/features/help/help-manifest.mjs";
import { PROJECT_REPORT_CATEGORIES } from "@/features/help/help-options";
import { openHelpRequest } from "@/features/help/help-transport";

import {
  HelpErrorSummary,
  HelpTextArea,
  HelpTextField,
} from "./help-form-fields";
import { HelpReview } from "./help-review";

export interface HelpProjectOption {
  id: string;
  name: string;
  creator: string;
  canonicalUrl: string;
  searchableText: string;
}

const categoryLabels: Record<ProjectReportCategory, string> = {
  "incorrect-information": "Incorrect or outdated card information",
  "source-moved-or-unavailable":
    "Repository moved, renamed, archived, or disappeared",
  "duplicate-or-wrong-listing": "Duplicate or wrong listing",
  "unsafe-or-malicious": "Unsafe or malicious project",
  "abusive-or-inappropriate": "Abusive or inappropriate content",
  "rights-concern": "Copyright, trademark, or other rights concern",
  "other-listing-concern": "Something else about this listing",
};

const categoryGuidance: Record<ProjectReportCategory, string> = {
  "incorrect-information":
    "Explain what is wrong and what the correct information should be.",
  "source-moved-or-unavailable":
    "Share the last known source and the proposed current source.",
  "duplicate-or-wrong-listing": "Tell us which listing should remain.",
  "unsafe-or-malicious":
    "Describe the specific behavior and include public evidence.",
  "abusive-or-inappropriate":
    "Describe the content or behavior that violates Tavernary's published safety boundaries.",
  "rights-concern":
    "Explain your relationship to the affected work and the review you are requesting. Do not publish private legal or personal information.",
  "other-listing-concern":
    "Describe the listing concern for maintainers to review.",
};

function nullable(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function selectedProjectId(
  projects: HelpProjectOption[],
  candidate: string | null,
) {
  return candidate && projects.some((project) => project.id === candidate)
    ? candidate
    : "";
}

function isProjectReportCategory(
  value: string,
): value is ProjectReportCategory {
  return PROJECT_REPORT_CATEGORIES.includes(value as ProjectReportCategory);
}

export function displayProjectReportCategory(category: ProjectReportCategory) {
  return categoryLabels[category];
}

export function ProjectReportForm({
  projects,
  siteRevision,
}: {
  projects: HelpProjectOption[];
  siteRevision: string;
}) {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState(() =>
    selectedProjectId(projects, searchParams.get("project")),
  );
  const [category, setCategory] = useState<ProjectReportCategory | "">("");
  const [report, setReport] = useState("");
  const [requestedOutcome, setRequestedOutcome] = useState("");
  const [evidence, setEvidence] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [handoffError, setHandoffError] = useState("");

  const selected = projects.find((project) => project.id === projectId);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleProjects = projects.filter((project) =>
    `${project.name} ${project.creator} ${project.canonicalUrl} ${project.searchableText}`
      .toLocaleLowerCase()
      .includes(normalizedSearch),
  );

  const payload = selected
    ? {
        project_id: selected.id,
        canonical_source: selected.canonicalUrl,
        category: category as ProjectReportCategory,
        report: report.trim(),
        requested_outcome: nullable(requestedOutcome),
        evidence: nullable(evidence),
      }
    : null;

  function validate() {
    const nextErrors: string[] = [];
    if (!selected) nextErrors.push("Select a listed project.");
    if (!category) nextErrors.push("Choose what is wrong.");
    if (!report.trim())
      nextErrors.push("Describe what Tavernary should review.");
    if (report.length > 3_000)
      nextErrors.push("Your report must be 3,000 characters or fewer.");
    if (requestedOutcome.length > 1_000)
      nextErrors.push(
        "Your requested outcome must be 1,000 characters or fewer.",
      );
    if (evidence.length > 2_000)
      nextErrors.push(
        "Your public supporting evidence must be 2,000 characters or fewer.",
      );
    setErrors(nextErrors);
    return nextErrors.length === 0;
  }

  async function continueOnGitHub() {
    if (!selected || !isProjectReportCategory(category) || !payload) return;
    setHandoffError("");
    setContinuing(true);
    try {
      await openHelpRequest({
        formUrl: "https://github.com/MentallyQuill/Tavernary/issues/new",
        template: "02-project-information.yml",
        manifestFieldId: "help-manifest",
        manifest: {
          schema_version: 1,
          request_kind: "project-report",
          origin: {
            page_url: "/help/report-project/",
            site_revision: siteRevision,
          },
          payload: payload satisfies ProjectReportPayload,
        },
        prefills: [
          ["project", `${selected.name} — ${selected.canonicalUrl}`],
          ["category", displayProjectReportCategory(category)],
          ["report", report.trim()],
          ["requested-outcome", requestedOutcome.trim()],
          ["evidence", evidence.trim()],
        ],
        pasteInstruction:
          "Paste the Help manifest copied by Tavernary into the manifest field.",
      });
    } catch (error) {
      setHandoffError(
        error instanceof Error
          ? error.message
          : "GitHub could not be opened. Please try again.",
      );
    } finally {
      setContinuing(false);
    }
  }

  if (reviewing && selected && isProjectReportCategory(category) && payload) {
    return (
      <>
        <HelpErrorSummary errors={handoffError ? [handoffError] : []} />
        <HelpReview
          rows={[
            {
              label: "Project",
              value: `${selected.name} — ${selected.canonicalUrl}`,
            },
            {
              label: "Category",
              value: displayProjectReportCategory(category),
            },
            { label: "What Tavernary should review", value: payload.report },
            {
              label: "Requested outcome",
              value: payload.requested_outcome ?? "",
            },
            {
              label: "Public supporting evidence",
              value: payload.evidence ?? "",
            },
          ]}
          onBack={() => setReviewing(false)}
          onCancel={() => setReviewing(false)}
          onContinue={continueOnGitHub}
          continuing={continuing}
        />
      </>
    );
  }

  return (
    <form
      className="help-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (validate()) setReviewing(true);
      }}
    >
      <HelpErrorSummary errors={errors} />
      <p className="help-hint">
        Are you an owner?{" "}
        <Link href="/help/manage-project/">Manage your project listing.</Link> A
        Tavernary vulnerability?{" "}
        <Link href="/help/security/">Report it privately.</Link>
      </p>
      <HelpTextField
        id="project-search"
        label="Search listed projects"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        hint="Search the published catalog by name, creator, source, or catalog text."
      />
      <div className="help-field">
        <label htmlFor="project">Project</label>
        <select
          id="project"
          value={projectId}
          aria-invalid={errors.includes("Select a listed project.")}
          onChange={(event) =>
            setProjectId(selectedProjectId(projects, event.target.value))
          }
        >
          <option value="">Select a listed project</option>
          {visibleProjects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name} — {project.creator}
            </option>
          ))}
        </select>
      </div>
      <div className="help-field">
        <label htmlFor="project-category">What is wrong?</label>
        <select
          id="project-category"
          value={category}
          aria-invalid={errors.includes("Choose what is wrong.")}
          onChange={(event) => {
            const nextCategory = event.target.value;
            setCategory(
              isProjectReportCategory(nextCategory) ? nextCategory : "",
            );
          }}
        >
          <option value="">Choose a concern</option>
          {PROJECT_REPORT_CATEGORIES.map((option) => (
            <option key={option} value={option}>
              {displayProjectReportCategory(option)}
            </option>
          ))}
        </select>
        {category ? (
          <p className="help-hint">{categoryGuidance[category]}</p>
        ) : null}
      </div>
      <HelpTextArea
        id="project-report"
        label="What should Tavernary review?"
        value={report}
        maxLength={3_000}
        onChange={(event) => setReport(event.target.value)}
        error={errors.find((error) =>
          error.includes("Describe what Tavernary should review"),
        )}
        hint="Everything you submit will be public on GitHub. Do not include secrets or private personal information."
        count={`${report.length}/3000`}
      />
      <HelpTextArea
        id="requested-outcome"
        label="What outcome are you requesting?"
        value={requestedOutcome}
        maxLength={1_000}
        onChange={(event) => setRequestedOutcome(event.target.value)}
        count={`${requestedOutcome.length}/1000`}
      />
      <HelpTextArea
        id="project-evidence"
        label="Public supporting evidence"
        value={evidence}
        maxLength={2_000}
        onChange={(event) => setEvidence(event.target.value)}
        hint="You can include repository files, releases, commits, issues, public documentation, or the other catalog entry in a duplicate report."
        count={`${evidence.length}/2000`}
      />
      <div className="help-actions">
        <button type="submit" className="help-continue-action">
          Review request
        </button>
      </div>
    </form>
  );
}

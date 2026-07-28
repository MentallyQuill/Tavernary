"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import type {
  KitReportCategory,
  KitReportPayload,
} from "@/features/help/help-manifest.mjs";
import { KIT_REPORT_CATEGORIES } from "@/features/help/help-options";
import { openHelpRequest } from "@/features/help/help-transport";

import {
  HelpErrorSummary,
  HelpTextArea,
  HelpTextField,
} from "./help-form-fields";
import { HelpReview } from "./help-review";

export interface HelpKitOption {
  id: string;
  title: string;
  author: string;
  shareUrl: string;
  publishedAt: string;
  projects: Array<{ id: string; name: string }>;
}

const categoryLabels: Record<KitReportCategory, string> = {
  "compatibility-problem": "Compatibility problem",
  "unsafe-or-malicious-included-project":
    "Unsafe or malicious included project",
  "abusive-or-inappropriate-content": "Abusive or inappropriate content",
  "broken-removed-or-unavailable-project":
    "Broken, removed, or unavailable project",
  "misleading-title-or-description": "Misleading title or description",
  "duplicate-kit": "Duplicate Kit",
  "author-or-attribution-concern": "Author or attribution concern",
  "other-kit-concern": "Other Kit concern",
};

function nullable(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function selectedKitId(kits: HelpKitOption[], candidate: string | null) {
  return candidate && kits.some((kit) => kit.id === candidate) ? candidate : "";
}

function isKitReportCategory(value: string): value is KitReportCategory {
  return KIT_REPORT_CATEGORIES.includes(value as KitReportCategory);
}

function hasAffectedProjects(category: KitReportCategory | "") {
  return (
    category === "compatibility-problem" ||
    category === "broken-removed-or-unavailable-project"
  );
}

export function displayKitReportCategory(category: KitReportCategory) {
  return categoryLabels[category];
}

export function KitReportForm({
  kits,
  siteRevision,
}: {
  kits: HelpKitOption[];
  siteRevision: string;
}) {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [kitId, setKitId] = useState(() =>
    selectedKitId(kits, searchParams.get("kit")),
  );
  const [category, setCategory] = useState<KitReportCategory | "">("");
  const [affectedProjectIds, setAffectedProjectIds] = useState<string[]>([]);
  const [otherKitId, setOtherKitId] = useState("");
  const [details, setDetails] = useState("");
  const [evidence, setEvidence] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [handoffError, setHandoffError] = useState("");

  const selected = kits.find((kit) => kit.id === kitId);
  const otherKit = kits.find((kit) => kit.id === otherKitId);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleKits = kits.filter((kit) =>
    `${kit.title} ${kit.author} ${kit.id}`
      .toLocaleLowerCase()
      .includes(normalizedSearch),
  );
  const selectedProjectIds = new Set(
    selected?.projects.map((project) => project.id),
  );
  const validAffectedProjectIds = [...new Set(affectedProjectIds)].filter(
    (id) => selectedProjectIds.has(id),
  );
  const reviewedDetails =
    category === "duplicate-kit" && otherKit
      ? `Other Kit: ${otherKit.title} (${otherKit.id})\n\n${details.trim()}`
      : details.trim();
  const payload: KitReportPayload | null =
    selected && isKitReportCategory(category)
      ? {
          kit_id: selected.id,
          canonical_share_url: selected.shareUrl,
          kit_revision: selected.publishedAt,
          category,
          affected_project_ids: hasAffectedProjects(category)
            ? validAffectedProjectIds
            : [],
          details: reviewedDetails,
          evidence: nullable(evidence),
        }
      : null;

  function selectKit(nextKitId: string) {
    const validKitId = selectedKitId(kits, nextKitId);
    setKitId(validKitId);
    setAffectedProjectIds([]);
    setOtherKitId("");
  }

  function toggleAffectedProject(projectId: string, checked: boolean) {
    if (!selectedProjectIds.has(projectId)) return;
    setAffectedProjectIds((current) =>
      checked
        ? [...new Set([...current, projectId])]
        : current.filter((id) => id !== projectId),
    );
  }

  function validate() {
    const nextErrors: string[] = [];
    if (!selected) nextErrors.push("Select a published Kit.");
    if (!isKitReportCategory(category))
      nextErrors.push("Choose what is wrong.");
    if (category === "duplicate-kit" && !otherKit) {
      nextErrors.push("Select the other published Kit.");
    }
    if (!details.trim())
      nextErrors.push("Describe what Tavernary should review.");
    if (details.length > 3_000) {
      nextErrors.push("Your details must be 3,000 characters or fewer.");
    }
    if (reviewedDetails.length > 3_000) {
      nextErrors.push(
        "Your details and other Kit must be 3,000 characters or fewer.",
      );
    }
    if (evidence.length > 2_000) {
      nextErrors.push(
        "Your public supporting evidence must be 2,000 characters or fewer.",
      );
    }
    setErrors(nextErrors);
    return nextErrors.length === 0;
  }

  async function continueOnGitHub() {
    if (!payload) return;
    setHandoffError("");
    setContinuing(true);
    try {
      await openHelpRequest({
        formUrl: "https://github.com/MentallyQuill/Tavernary/issues/new",
        template: "06-kit-report.yml",
        manifestFieldId: "help-manifest",
        manifest: {
          schema_version: 1,
          request_kind: "kit-report",
          origin: {
            page_url: "/help/report-kit/",
            site_revision: siteRevision,
          },
          payload: payload satisfies KitReportPayload,
        },
        prefills: [
          ["kit-id", selected?.id ?? ""],
          ["share-url", selected?.shareUrl ?? ""],
          ["category", displayKitReportCategory(payload.category)],
          ["affected-project-ids", payload.affected_project_ids.join(", ")],
          ["details", payload.details],
          ["evidence", payload.evidence ?? ""],
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

  if (reviewing && payload) {
    return (
      <>
        <HelpErrorSummary errors={handoffError ? [handoffError] : []} />
        <HelpReview
          rows={[
            {
              label: "Kit",
              value: `${selected?.title} â€” @${selected?.author}`,
            },
            {
              label: "Category",
              value: displayKitReportCategory(payload.category),
            },
            {
              label: "Affected Kit projects",
              value:
                selected?.projects
                  .filter((project) =>
                    payload.affected_project_ids.includes(project.id),
                  )
                  .map((project) => project.name)
                  .join(", ") ?? "",
            },
            { label: "What Tavernary should review", value: payload.details },
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
        Are you the Kit author?{" "}
        <Link href="/?mode=kits">Edit the Kit in the Kit Builder</Link> or{" "}
        <Link href="/?mode=kits">
          use the existing author withdrawal action
        </Link>
        .
      </p>
      <HelpTextField
        id="kit-search"
        label="Search published Kits"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        hint="Search published Kits by title, author, or Kit ID."
      />
      <div className="help-field">
        <label htmlFor="kit">Kit</label>
        <select
          id="kit"
          value={kitId}
          aria-invalid={errors.includes("Select a published Kit.")}
          onChange={(event) => selectKit(event.target.value)}
        >
          <option value="">Select a published Kit</option>
          {visibleKits.map((kit) => (
            <option key={kit.id} value={kit.id}>
              {kit.title} â€” @{kit.author}
            </option>
          ))}
        </select>
      </div>
      <div className="help-field">
        <label htmlFor="kit-category">What is wrong?</label>
        <select
          id="kit-category"
          value={category}
          aria-invalid={errors.includes("Choose what is wrong.")}
          onChange={(event) => {
            const nextCategory = event.target.value;
            setCategory(isKitReportCategory(nextCategory) ? nextCategory : "");
            setAffectedProjectIds([]);
            setOtherKitId("");
          }}
        >
          <option value="">Choose a concern</option>
          {KIT_REPORT_CATEGORIES.map((option) => (
            <option key={option} value={option}>
              {displayKitReportCategory(option)}
            </option>
          ))}
        </select>
        {category === "unsafe-or-malicious-included-project" ? (
          <p className="help-hint">
            Is the concern about the underlying project rather than this
            Kit&apos;s inclusion or presentation?{" "}
            <Link href="/help/report-project/">
              Report the project listing instead
            </Link>
            .
          </p>
        ) : null}
        {category === "author-or-attribution-concern" ? (
          <p className="help-hint">
            Explain what author or source information is wrong.
          </p>
        ) : null}
      </div>
      {selected && hasAffectedProjects(category) ? (
        <fieldset className="help-field">
          <legend>Affected Kit projects</legend>
          <p className="help-hint">Select any affected projects in this Kit.</p>
          {selected.projects.map((project) => (
            <label key={project.id}>
              <input
                type="checkbox"
                checked={validAffectedProjectIds.includes(project.id)}
                onChange={(event) =>
                  toggleAffectedProject(project.id, event.target.checked)
                }
              />{" "}
              {project.name}
            </label>
          ))}
        </fieldset>
      ) : null}
      {selected && category === "duplicate-kit" ? (
        <div className="help-field">
          <label htmlFor="other-kit">Other Kit</label>
          <select
            id="other-kit"
            value={otherKitId}
            aria-invalid={errors.includes("Select the other published Kit.")}
            onChange={(event) =>
              setOtherKitId(selectedKitId(kits, event.target.value))
            }
          >
            <option value="">Select the other published Kit</option>
            {kits
              .filter((kit) => kit.id !== selected.id)
              .map((kit) => (
                <option key={kit.id} value={kit.id}>
                  {kit.title} â€” @{kit.author}
                </option>
              ))}
          </select>
        </div>
      ) : null}
      <HelpTextArea
        id="kit-details"
        label="What should Tavernary review?"
        value={details}
        maxLength={3_000}
        onChange={(event) => setDetails(event.target.value)}
        error={errors.find((error) =>
          error.includes("Describe what Tavernary"),
        )}
        hint="Everything you submit will be public on GitHub. Do not include secrets or private personal information."
        count={`${details.length}/3000`}
      />
      <HelpTextArea
        id="kit-evidence"
        label="Public supporting evidence"
        value={evidence}
        maxLength={2_000}
        onChange={(event) => setEvidence(event.target.value)}
        hint="You can include public repository files, releases, commits, issues, or documentation."
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

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import {
  EXTENSION_PRIMARY_FUNCTION_IDS,
  STRUCTURAL_PRIMARY_FUNCTIONS,
} from "@/features/catalog/primary-function-contract.mjs";
import {
  CATALOG_DESCRIPTION_GUIDANCE,
  CATALOG_EMOJI_REMOVED_NOTICE,
  CATALOG_POLICY_ROUTE,
} from "@/features/catalog/catalog-policy.mjs";
import { stripEmoji } from "@/features/catalog/emoji-free-text.mjs";
import type {
  OwnerCardOriginal,
  OwnerEditableValues,
  OwnerOperation,
  ProjectOwnerManifest,
} from "@/features/help/project-owner-manifest.mjs";
import { normalizeProjectOwnerManifest } from "@/features/help/project-owner-manifest.mjs";
import {
  HelpHandoffError,
  openHelpRequest,
} from "@/features/help/help-transport";
import type { OwnerProjectOption } from "@/lib/help/load-owner-project-options";

import {
  HelpChoiceGroup,
  HelpErrorSummary,
  HelpSelectField,
  HelpTextArea,
  HelpTextField,
} from "./help-form-fields";
import { HelpReview } from "./help-review";

interface VocabularyOption {
  id: string;
  label: string;
  description?: string;
}

export interface OwnerBuilderVocabularies {
  frontends: VocabularyOption[];
  primaryFunctions: VocabularyOption[];
  capabilities: VocabularyOption[];
  modelFamilies: VocabularyOption[];
  completionFormats: VocabularyOption[];
}

const operationLabels: Record<OwnerOperation, string> = {
  "edit-card": "Edit card details",
  "move-source": "Update repository location",
  delist: "Delist this project",
};

const delistConfirmation = "I am requesting that Tavernary delist this project";

function initialProjectId(
  projects: OwnerProjectOption[],
  candidate: string | null,
) {
  return candidate && projects.some((project) => project.id === candidate)
    ? candidate
    : "";
}

function repositoryUrl(repository: string | null) {
  return repository ? `https://github.com/${repository}` : "";
}

function parsePublicGitHubRepository(value: string) {
  try {
    const url = new URL(value.trim());
    const parts = url.pathname.split("/").filter(Boolean);
    if (
      url.protocol !== "https:" ||
      url.hostname.toLocaleLowerCase() !== "github.com" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      parts.length !== 2
    ) {
      return null;
    }
    const repository = parts[1]?.replace(/\.git$/iu, "");
    if (
      !parts[0] ||
      !repository ||
      !/^[A-Za-z0-9_.-]+$/u.test(parts[0]) ||
      !/^[A-Za-z0-9_.-]+$/u.test(repository)
    ) {
      return null;
    }
    return `${parts[0]}/${repository}`;
  } catch {
    return null;
  }
}

function uniqueToggle(values: string[], id: string, checked: boolean) {
  if (checked) return values.includes(id) ? values : [...values, id];
  return values.filter((value) => value !== id);
}

function OptionCheckboxes({
  legend,
  options,
  values,
  onChange,
}: {
  legend: string;
  options: VocabularyOption[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <HelpChoiceGroup legend={legend}>
      {options.map((option) => (
        <label className="help-choice" key={option.id}>
          <input
            type="checkbox"
            checked={values.includes(option.id)}
            onChange={(event) =>
              onChange(uniqueToggle(values, option.id, event.target.checked))
            }
          />
          <span>{option.label}</span>
        </label>
      ))}
    </HelpChoiceGroup>
  );
}

function originalEdit(project: OwnerProjectOption): OwnerCardOriginal {
  return {
    kind: project.kind,
    name: project.editable.name,
    summary: project.editable.summary,
    frontends: [...project.editable.frontends],
    primary_function: project.editable.primaryFunction,
    capabilities: [...project.editable.capabilities],
    model_families: [...project.editable.modelFamilies],
    completion_formats: [...project.editable.completionFormats],
  };
}

function manuallyCurates(manifest: ProjectOwnerManifest) {
  const enrichmentFields = ["summary", "capabilities"] as const;
  return (
    manifest.operation === "edit-card" &&
    enrichmentFields.some(
      (field) =>
        JSON.stringify(manifest.original[field]) !==
        JSON.stringify(manifest.proposed[field]),
    )
  );
}

function policyStatement(
  manifest: ProjectOwnerManifest,
  project: OwnerProjectOption,
) {
  if (manifest.operation === "edit-card") {
    return manuallyCurates(manifest)
      ? "Summary or capability edits change model enrichment to manual."
      : `This edit preserves the ${project.listingState.enrichmentPolicy} enrichment policy.`;
  }
  if (manifest.operation === "move-source") {
    return "A source move must retain repository ID.";
  }
  return "Delisting disables, pauses, and retains the record.";
}

function reviewValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ") || "None";
  if (typeof value === "string") return value || "None";
  return value === null || value === undefined ? "None" : String(value);
}

function operationReviewRows(
  manifest: ProjectOwnerManifest,
  project: OwnerProjectOption,
) {
  if (manifest.operation === "edit-card") {
    const manualEnrichment = manuallyCurates(manifest);
    return [
      {
        label: "Before: display name",
        value: reviewValue(manifest.original.name),
      },
      { label: "After: display name", value: manifest.proposed.name },
      {
        label: "Before: summary",
        value: reviewValue(manifest.original.summary),
      },
      { label: "After: summary", value: manifest.proposed.summary },
      {
        label: "Before: supported frontends",
        value: reviewValue(manifest.original.frontends),
      },
      {
        label: "After: supported frontends",
        value: reviewValue(manifest.proposed.frontends),
      },
      {
        label: "Before: primary function",
        value: reviewValue(manifest.original.primary_function),
      },
      {
        label: "After: primary function",
        value: manifest.proposed.primary_function,
      },
      {
        label: "Before: capabilities",
        value: reviewValue(manifest.original.capabilities),
      },
      {
        label: "After: capabilities",
        value: reviewValue(manifest.proposed.capabilities),
      },
      ...(manifest.original.kind === "preset"
        ? [
            {
              label: "Before: model families",
              value: reviewValue(manifest.original.model_families),
            },
            {
              label: "After: model families",
              value: reviewValue(manifest.proposed.model_families),
            },
            {
              label: "Before: completion formats",
              value: reviewValue(manifest.original.completion_formats),
            },
            {
              label: "After: completion formats",
              value: reviewValue(manifest.proposed.completion_formats),
            },
          ]
        : []),
      {
        label: "Before: metadata status",
        value: project.listingState.metadataStatus,
      },
      {
        label: "After: metadata status",
        value: manualEnrichment
          ? "curated"
          : project.listingState.metadataStatus,
      },
      {
        label: "Before: enrichment policy",
        value: project.listingState.enrichmentPolicy,
      },
      {
        label: "After: enrichment policy",
        value: manualEnrichment
          ? "manual"
          : project.listingState.enrichmentPolicy,
      },
      {
        label: "Before: refresh policy",
        value: project.listingState.refreshPolicy,
      },
      {
        label: "After: refresh policy",
        value: project.listingState.refreshPolicy,
      },
    ];
  }
  if (manifest.operation === "move-source") {
    return [
      {
        label: "Before: repository",
        value: repositoryUrl(
          typeof manifest.original.repository === "string"
            ? manifest.original.repository
            : null,
        ),
      },
      {
        label: "After: repository",
        value: repositoryUrl(manifest.proposed.repository),
      },
      {
        label: "Before: repository ID",
        value: reviewValue(manifest.original.repository_id),
      },
      {
        label: "After: repository ID",
        value: reviewValue(manifest.proposed.repository_id),
      },
    ];
  }
  return [
    { label: "Confirmation", value: delistConfirmation },
    {
      label: "Before: visibility",
      value: project.listingState.visibility,
    },
    {
      label: "Before: visibility reason",
      value: reviewValue(project.listingState.visibilityReason),
    },
    {
      label: "Before: refresh policy",
      value: project.listingState.refreshPolicy,
    },
    {
      label: "Before: enrichment policy",
      value: project.listingState.enrichmentPolicy,
    },
    { label: "After: visibility", value: manifest.proposed.visibility },
    {
      label: "After: visibility reason",
      value: manifest.proposed.visibility_reason,
    },
    {
      label: "After: refresh policy",
      value: manifest.proposed.refresh_policy,
    },
    {
      label: "After: enrichment policy",
      value: manifest.proposed.enrichment_policy,
    },
  ];
}

export function ProjectOwnerBuilder({
  projects,
  vocabularies,
}: {
  projects: OwnerProjectOption[];
  vocabularies: OwnerBuilderVocabularies;
}) {
  const searchParams = useSearchParams();
  const startingProjectId = initialProjectId(
    projects,
    searchParams.get("project"),
  );
  const startingProject = projects.find(
    (project) => project.id === startingProjectId,
  );
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState(startingProjectId);
  const [operation, setOperation] = useState<OwnerOperation | "">("");
  const [name, setName] = useState(startingProject?.editable.name ?? "");
  const [summary, setSummary] = useState(
    startingProject?.editable.summary ?? "",
  );
  const [emojiNotice, setEmojiNotice] = useState(false);
  const [frontends, setFrontends] = useState(
    startingProject?.editable.frontends ?? [],
  );
  const [primaryFunction, setPrimaryFunction] = useState(
    startingProject?.editable.primaryFunction ?? "",
  );
  const [capabilities, setCapabilities] = useState(
    startingProject?.editable.capabilities ?? [],
  );
  const [modelFamilies, setModelFamilies] = useState(
    startingProject?.editable.modelFamilies ?? [],
  );
  const [completionFormats, setCompletionFormats] = useState(
    startingProject?.editable.completionFormats ?? [],
  );
  const [proposedRepositoryUrl, setProposedRepositoryUrl] = useState("");
  const [explanation, setExplanation] = useState("");
  const [confirmedDelist, setConfirmedDelist] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [handoffError, setHandoffError] = useState("");
  const [fallbackUrl, setFallbackUrl] = useState("");
  const [reviewManifest, setReviewManifest] =
    useState<ProjectOwnerManifest | null>(null);

  const selected = projects.find((project) => project.id === projectId);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleProjects = projects.filter(
    (project) =>
      project.id === projectId ||
      `${project.name} ${project.id} ${project.repository ?? ""}`
        .toLocaleLowerCase()
        .includes(normalizedSearch),
  );

  function selectProject(id: string) {
    const project = projects.find((candidate) => candidate.id === id);
    setProjectId(project?.id ?? "");
    setOperation("");
    setName(project?.editable.name ?? "");
    setSummary(project?.editable.summary ?? "");
    setFrontends(project?.editable.frontends ?? []);
    setPrimaryFunction(project?.editable.primaryFunction ?? "");
    setCapabilities(project?.editable.capabilities ?? []);
    setModelFamilies(project?.editable.modelFamilies ?? []);
    setCompletionFormats(project?.editable.completionFormats ?? []);
    setProposedRepositoryUrl("");
    setExplanation("");
    setConfirmedDelist(false);
    setErrors([]);
    setHandoffError("");
    setFallbackUrl("");
  }

  function proposedEdit(): OwnerEditableValues {
    const proposedPrimaryFunction =
      selected?.kind === "extension"
        ? primaryFunction
        : selected
          ? STRUCTURAL_PRIMARY_FUNCTIONS[selected.kind]
          : primaryFunction;
    return {
      name,
      summary,
      frontends,
      primary_function: proposedPrimaryFunction,
      capabilities,
      model_families: modelFamilies,
      completion_formats: completionFormats,
    };
  }

  function candidateManifest(): object | null {
    if (!selected || !operation) {
      return null;
    }
    const repositoryId =
      selected.sourceType === "github" &&
      Number.isSafeInteger(selected.repositoryId) &&
      (selected.repositoryId ?? 0) > 0
        ? selected.repositoryId
        : null;
    if (
      operation === "move-source" &&
      (!selected.repository || !repositoryId)
    ) {
      return null;
    }
    const envelope = {
      schema_version: 1,
      request_kind: "project-owner",
      operation,
      project_id: selected.id,
      repository_id: repositoryId,
      source_fingerprint: selected.sourceFingerprint,
      explanation: explanation.trim() || null,
    };
    if (operation === "edit-card") {
      return {
        ...envelope,
        original: originalEdit(selected),
        proposed: proposedEdit(),
      };
    }
    if (operation === "move-source") {
      const proposedRepository = parsePublicGitHubRepository(
        proposedRepositoryUrl,
      );
      return {
        ...envelope,
        original: {
          repository: selected.repository,
          repository_id: repositoryId,
        },
        proposed: {
          repository: proposedRepository ?? "",
          repository_id: repositoryId,
        },
      };
    }
    return {
      ...envelope,
      original: { visibility: "published" },
      proposed: {
        visibility: "disabled",
        visibility_reason: "removed",
        refresh_policy: "paused",
        enrichment_policy: "manual",
      },
    };
  }

  function validate() {
    const nextErrors: string[] = [];
    if (!selected) nextErrors.push("Select a listed project.");
    if (!operation) nextErrors.push("Choose an owner request type.");
    if (operation === "move-source" && selected && !selected.eligibleShape) {
      nextErrors.push(
        "Repository location updates require a public GitHub record with an immutable repository ID.",
      );
    }
    if (
      operation === "move-source" &&
      !parsePublicGitHubRepository(proposedRepositoryUrl)
    ) {
      nextErrors.push("Enter one public GitHub repository URL.");
    }
    if (operation === "delist" && !confirmedDelist) {
      nextErrors.push("Confirm that Tavernary should delist this project.");
    }
    const candidate = candidateManifest();
    if (candidate) {
      const result = normalizeProjectOwnerManifest(candidate, vocabularies);
      if (!result.valid) nextErrors.push(...result.errors);
      else setReviewManifest(result.manifest);
    }
    const uniqueErrors = [...new Set(nextErrors)];
    setErrors(uniqueErrors);
    return uniqueErrors.length === 0;
  }

  async function continueOnGitHub() {
    if (!selected || !operation || !reviewManifest) return;
    setHandoffError("");
    setContinuing(true);
    const proposed =
      reviewManifest.operation === "edit-card" ? reviewManifest.proposed : null;
    try {
      await openHelpRequest({
        formUrl: "https://github.com/MentallyQuill/Tavernary/issues/new",
        template: "08-project-owner-request.yml",
        manifestFieldId: "owner-request-manifest",
        manifest: reviewManifest,
        prefills: [
          ["request-type", operationLabels[operation]],
          ["project-id", selected.id],
          [
            "repository",
            selected.sourceUrl ?? repositoryUrl(selected.repository),
          ],
          ["proposed-name", proposed?.name ?? ""],
          ["proposed-summary", proposed?.summary ?? ""],
          ["supported-frontends", proposed?.frontends.join("\n") ?? ""],
          ["primary-function", proposed?.primary_function ?? ""],
          ["capabilities", proposed?.capabilities.join("\n") ?? ""],
          ["model-families", proposed?.model_families.join("\n") ?? ""],
          ["completion-formats", proposed?.completion_formats.join("\n") ?? ""],
          [
            "proposed-repository",
            operation === "move-source" ? proposedRepositoryUrl.trim() : "",
          ],
          ["explanation", explanation.trim()],
          [
            "delist-confirmation",
            operation === "delist" ? delistConfirmation : "",
          ],
        ],
        pasteInstruction:
          "Paste the owner request manifest copied by Tavernary into the manifest field.",
      });
    } catch (error) {
      if (error instanceof HelpHandoffError) setFallbackUrl(error.url);
      setHandoffError(
        error instanceof Error
          ? error.message
          : "GitHub could not be opened. Please try again.",
      );
    } finally {
      setContinuing(false);
    }
  }

  if (reviewing && selected && operation && reviewManifest) {
    return (
      <>
        <HelpErrorSummary
          errors={handoffError ? [handoffError] : []}
          heading="GitHub could not be opened automatically."
        />
        <HelpReview
          rows={[
            {
              label: "Project",
              value: `${selected.name} — ${selected.sourceUrl ?? selected.id}`,
            },
            { label: "Request type", value: operationLabels[operation] },
            {
              label: "Verification",
              value:
                "GitHub will verify either current personal-owner authority or reviewed Tavernary staff authority.",
            },
            ...operationReviewRows(reviewManifest, selected),
            {
              label: "Policy effect",
              value: policyStatement(reviewManifest, selected),
            },
            { label: "Explanation", value: explanation.trim() },
          ]}
          onBack={() => setReviewing(false)}
          onCancel={() => setReviewing(false)}
          onContinue={continueOnGitHub}
          returnFocusId="owner-project-search"
          continuing={continuing}
          fallbackUrl={fallbackUrl}
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
        setHandoffError("");
        if (validate()) setReviewing(true);
      }}
    >
      <HelpErrorSummary errors={errors} />
      <p className="help-hint">
        Personal-owner self-service requires a public GitHub record with an
        immutable repository ID. Reviewed Tavernary owners, admins, and
        maintainers may use this form for any catalog record. GitHub verifies
        authority after submission.
      </p>
      <HelpTextField
        id="owner-project-search"
        label="Search listed projects"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        hint="Search by project name, repository owner, repository name, or project ID."
      />
      <HelpSelectField
        id="owner-project"
        label="Project"
        value={projectId}
        error={errors.find((error) => error === "Select a listed project.")}
        onChange={(event) => selectProject(event.target.value)}
      >
        <option value="">Select a listed project</option>
        {visibleProjects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name} — {project.repository ?? project.id}
          </option>
        ))}
      </HelpSelectField>
      {selected && !selected.eligibleShape ? (
        <div className="help-security-callout">
          <p>
            {selected.ineligibilityReason} Trusted Tavernary staff may continue
            below.
          </p>
          <Link href={`/help/report-project/?project=${selected.id}`}>
            Report this listing instead
          </Link>
        </div>
      ) : null}
      {selected ? (
        <>
          <HelpChoiceGroup
            legend="What would you like to do?"
            error={errors.find(
              (error) => error === "Choose an owner request type.",
            )}
          >
            {(Object.keys(operationLabels) as OwnerOperation[])
              .filter(
                (value) => value !== "move-source" || selected.eligibleShape,
              )
              .map((value) => (
                <label className="help-choice" key={value}>
                  <input
                    type="radio"
                    name="owner-operation"
                    value={value}
                    checked={operation === value}
                    onChange={() => {
                      setOperation(value);
                      setErrors([]);
                    }}
                  />
                  <span>{operationLabels[value]}</span>
                </label>
              ))}
          </HelpChoiceGroup>
          {operation === "edit-card" ? (
            <>
              <HelpTextField
                id="owner-name"
                label="Display name"
                value={name}
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
                error={errors.find((error) =>
                  error.startsWith("Owner display name"),
                )}
              />
              <HelpTextArea
                id="owner-summary"
                label="Summary"
                value={summary}
                maxLength={220}
                onChange={(event) => {
                  const sanitized = stripEmoji(event.target.value);
                  setSummary(sanitized.value);
                  if (sanitized.removed) setEmojiNotice(true);
                }}
                error={errors.find((error) =>
                  error.startsWith("Owner summary"),
                )}
                count={`${summary.length} / 220`}
                hint={
                  <>
                    {CATALOG_DESCRIPTION_GUIDANCE}{" "}
                    <Link href={CATALOG_POLICY_ROUTE}>Catalog Policy</Link>
                  </>
                }
              />
              {emojiNotice ? (
                <p className="help-hint" role="status" aria-live="polite">
                  {CATALOG_EMOJI_REMOVED_NOTICE}
                </p>
              ) : null}
              <OptionCheckboxes
                legend="Supported frontends"
                options={vocabularies.frontends}
                values={frontends}
                onChange={setFrontends}
              />
              {selected.kind === "extension" ? (
                <HelpSelectField
                  id="owner-primary-function"
                  label="Primary function"
                  value={primaryFunction}
                  onChange={(event) => setPrimaryFunction(event.target.value)}
                  hint={
                    <ul className="help-option-definitions">
                      {vocabularies.primaryFunctions
                        .filter((option) =>
                          EXTENSION_PRIMARY_FUNCTION_IDS.includes(option.id),
                        )
                        .map((option) => (
                          <li key={option.id}>
                            <strong>{option.label}:</strong>{" "}
                            {option.description}
                          </li>
                        ))}
                    </ul>
                  }
                >
                  {vocabularies.primaryFunctions
                    .filter((option) =>
                      EXTENSION_PRIMARY_FUNCTION_IDS.includes(option.id),
                    )
                    .map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                </HelpSelectField>
              ) : (
                <HelpTextField
                  id="owner-primary-function"
                  label="Primary function"
                  value={STRUCTURAL_PRIMARY_FUNCTIONS[selected.kind]}
                  readOnly
                />
              )}
              <OptionCheckboxes
                legend="Capabilities"
                options={vocabularies.capabilities}
                values={capabilities}
                onChange={setCapabilities}
              />
              {selected.kind === "preset" ? (
                <>
                  <OptionCheckboxes
                    legend="Model families"
                    options={vocabularies.modelFamilies}
                    values={modelFamilies}
                    onChange={setModelFamilies}
                  />
                  <OptionCheckboxes
                    legend="Completion formats"
                    options={vocabularies.completionFormats}
                    values={completionFormats}
                    onChange={setCompletionFormats}
                  />
                </>
              ) : null}
            </>
          ) : null}
          {operation === "move-source" ? (
            <HelpTextField
              id="owner-proposed-repository"
              label="Public GitHub repository URL"
              value={proposedRepositoryUrl}
              type="url"
              onChange={(event) => setProposedRepositoryUrl(event.target.value)}
              error={errors.find(
                (error) => error === "Enter one public GitHub repository URL.",
              )}
              hint="Use the current public URL for this same repository. GitHub must report the same immutable repository ID."
            />
          ) : null}
          {operation === "delist" ? (
            <HelpChoiceGroup
              legend="Confirm delisting"
              error={errors.find(
                (error) =>
                  error ===
                  "Confirm that Tavernary should delist this project.",
              )}
            >
              <label className="help-choice">
                <input
                  type="checkbox"
                  checked={confirmedDelist}
                  onChange={(event) => setConfirmedDelist(event.target.checked)}
                />
                <span>{delistConfirmation}</span>
              </label>
            </HelpChoiceGroup>
          ) : null}
          {operation ? (
            <HelpTextArea
              id="owner-explanation"
              label={
                operation === "delist"
                  ? "Public note (optional)"
                  : "Explanation (optional)"
              }
              value={explanation}
              maxLength={operation === "delist" ? 500 : 1_000}
              onChange={(event) => setExplanation(event.target.value)}
              hint="Everything you submit will be public on GitHub. Do not include secrets or private personal information."
              count={`${explanation.length} / ${operation === "delist" ? 500 : 1_000}`}
            />
          ) : null}
        </>
      ) : null}
      <div className="help-actions">
        <button type="submit" className="help-continue-action">
          Review request
        </button>
      </div>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { DescribedSelect } from "@/components/forms/described-select";
import {
  TAG_FACET_PREVIEW_LIMIT,
  TagBrowser,
} from "@/features/catalog/components/tag-browser";
import type { PublicTagDefinition } from "@/features/catalog/tag-vocabulary";
import primaryFunctionVocabulary from "../../../../data/vocabularies/primary-functions.json";
import {
  normalizeProjectSubmissionManifest,
  type ProjectSubmissionManifest,
  type ProjectSubmissionType,
} from "../project-submission-manifest.mjs";
import {
  copyProjectSubmissionUrl,
  openProjectSubmission,
} from "../submission-transport";
import modelFamilyVocabulary from "../../../../data/vocabularies/model-families.json";
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
import { SubmissionReview } from "@/features/submissions/components/submission-review";

const projectSubmissionUrl =
  "https://github.com/MentallyQuill/Tavernary/issues/new";

const frontendEligibility =
  "Frontends and Extensions require a public GitHub or Codeberg repository.";

const extensionPrimaryFunctions =
  primaryFunctionVocabulary.primary_functions.filter((option) =>
    EXTENSION_PRIMARY_FUNCTION_IDS.includes(option.id),
  );

const summaryChoices = [
  {
    id: "automatic",
    label: "Let TavernAI write the description",
    description:
      "Uses the root README first and the repository's GitHub description second.",
  },
  {
    id: "manual",
    label: "Write the description myself",
    description:
      "Available to the verified repository owner or trusted Tavernary staff.",
  },
];

const tagChoices = [
  {
    id: "automatic",
    label: "Let Tavernary select tags",
    description:
      "Uses repository evidence to select up to six goals and traits.",
  },
  {
    id: "manual",
    label: "Set tags myself",
    description:
      "Available to the verified repository owner or trusted Tavernary staff.",
  },
];

export interface SubmissionFrontendOption {
  id: string;
  label: string;
  canonicalUrl: string;
}

type SubmissionField =
  | "project-type"
  | "project-url"
  | "project-description"
  | "project-tags"
  | "primary-function"
  | "frontend-selection"
  | "other-frontend-name"
  | "other-frontend-url"
  | "other-model-family"
  | "preset-compatibility";

interface SubmissionError {
  field: SubmissionField;
  message: string;
}

function publicHttpsUrl(value: string): URL | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !url.username && !url.password
      ? url
      : null;
  } catch {
    return null;
  }
}

function repositoryProviderFromUrl(
  value: string,
): "github" | "codeberg" | null {
  const url = publicHttpsUrl(value);
  if (!url || url.search || url.hash) return null;
  const hostname = url.hostname.toLowerCase();
  const provider =
    hostname === "github.com"
      ? "github"
      : hostname === "codeberg.org"
        ? "codeberg"
        : null;
  if (!provider) return null;
  const parts = url.pathname
    .replace(/\/+$/u, "")
    .replace(/\.git$/iu, "")
    .split("/")
    .filter(Boolean);
  return parts.length === 2 ? provider : null;
}

function projectTypeLabel(projectType: ProjectSubmissionType) {
  if (projectType === "frontend") return "Frontend";
  if (projectType === "extension") return "Extension";
  return "System Preset";
}

function vocabularyLabel(
  options: readonly { id: string; label: string }[],
  id: string,
) {
  return options.find((option) => option.id === id)?.label ?? id;
}

function manifestErrorField(message: string): SubmissionField {
  if (message.includes("primary function")) return "primary-function";
  if (/description|summary/iu.test(message)) return "project-description";
  if (/tag/iu.test(message)) return "project-tags";
  if (
    message.includes("supported frontend") ||
    message.includes("frontend-independent")
  ) {
    return "frontend-selection";
  }
  if (
    message.includes("model family") ||
    message.includes("completion format") ||
    message.includes("Model-Agnostic")
  ) {
    return "preset-compatibility";
  }
  return "project-url";
}

function InlineError({
  id,
  message,
}: {
  id: string;
  message: string | undefined;
}) {
  return message ? (
    <p className="submission-field-error" id={id}>
      {message}
    </p>
  ) : null;
}

export function ProjectSubmissionBuilder({
  frontends,
  tagVocabulary = [],
}: {
  frontends: SubmissionFrontendOption[];
  tagVocabulary?: readonly PublicTagDefinition[];
}) {
  const [projectType, setProjectType] = useState<ProjectSubmissionType | "">(
    "",
  );
  const [sourceUrl, setSourceUrl] = useState("");
  const [primaryFunction, setPrimaryFunction] = useState("");
  const [summaryMode, setSummaryMode] = useState<"automatic" | "manual">(
    "automatic",
  );
  const [description, setDescription] = useState("");
  const [tagMode, setTagMode] = useState<"automatic" | "manual">("automatic");
  const [tags, setTags] = useState<string[]>([]);
  const [emojiNotice, setEmojiNotice] = useState(false);
  const [additionalContext, setAdditionalContext] = useState("");
  const [frontendSearch, setFrontendSearch] = useState("");
  const [knownFrontendIds, setKnownFrontendIds] = useState<string[]>([]);
  const [includeOtherFrontend, setIncludeOtherFrontend] = useState(false);
  const [otherFrontendName, setOtherFrontendName] = useState("");
  const [otherFrontendUrl, setOtherFrontendUrl] = useState("");
  const [frontendIndependent, setFrontendIndependent] = useState(false);
  const [modelFamilies, setModelFamilies] = useState<string[]>([]);
  const [includeOtherModelFamily, setIncludeOtherModelFamily] = useState(false);
  const [otherModelFamily, setOtherModelFamily] = useState("");
  const [completionFormats, setCompletionFormats] = useState<string[]>([]);
  const [errors, setErrors] = useState<SubmissionError[]>([]);
  const [reviewManifest, setReviewManifest] =
    useState<ProjectSubmissionManifest | null>(null);

  const filteredFrontends = useMemo(() => {
    const query = frontendSearch.trim().toLocaleLowerCase();
    if (!query) return frontends;
    return frontends.filter((frontend) =>
      `${frontend.label} ${frontend.canonicalUrl}`
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [frontendSearch, frontends]);

  const selectedFrontends = knownFrontendIds.flatMap((id) => {
    const frontend = frontends.find((option) => option.id === id);
    return frontend ? [frontend] : [];
  });
  const showFrontendFields =
    projectType === "extension" ||
    (projectType === "preset" && !frontendIndependent);
  const applicableTags = useMemo(() => {
    if (!projectType) return [];
    return tagVocabulary
      .filter((tag) => tag.applicable_kinds.includes(projectType))
      .map((tag) => ({ ...tag }));
  }, [projectType, tagVocabulary]);
  const errorFor = (field: SubmissionField) =>
    errors.find((error) => error.field === field)?.message;

  function toggleFrontend(id: string) {
    setKnownFrontendIds((current) =>
      current.includes(id)
        ? current.filter((frontendId) => frontendId !== id)
        : [...current, id],
    );
  }

  function toggleModelFamily(id: string) {
    setModelFamilies((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleCompletionFormat(id: string) {
    setCompletionFormats((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function buildManifest(): ProjectSubmissionManifest | null {
    if (!projectType) {
      setErrors([
        {
          field: "project-type",
          message: "Project Type is required.",
        },
      ]);
      window.setTimeout(() => {
        document.getElementById("project-type")?.focus();
      }, 0);
      return null;
    }

    const submittedPrimaryFunction =
      projectType === "frontend"
        ? STRUCTURAL_PRIMARY_FUNCTIONS.frontend
        : projectType === "preset"
          ? STRUCTURAL_PRIMARY_FUNCTIONS.preset
          : primaryFunction;
    const activeFrontends =
      projectType === "frontend" || frontendIndependent
        ? { known_ids: [], other: [] }
        : {
            known_ids: knownFrontendIds,
            other: includeOtherFrontend
              ? [{ name: otherFrontendName, url: otherFrontendUrl }]
              : [],
          };
    const validation = normalizeProjectSubmissionManifest(
      {
        schema_version: 4,
        project_type: projectType,
        primary_function: submittedPrimaryFunction,
        source_url: sourceUrl,
        frontends: activeFrontends,
        frontend_independent: projectType === "preset" && frontendIndependent,
        additional_context: additionalContext,
        metadata: {
          summary:
            summaryMode === "manual"
              ? { mode: "manual", value: description }
              : { mode: "automatic" },
          tags:
            tagMode === "manual"
              ? { mode: "manual", values: tags }
              : { mode: "automatic" },
        },
        ...(projectType === "preset"
          ? {
              preset_compatibility: {
                model_families: {
                  known_ids: modelFamilies,
                  other:
                    includeOtherModelFamily && otherModelFamily.trim()
                      ? [otherModelFamily]
                      : [],
                },
                completion_formats: completionFormats,
              },
            }
          : {}),
      },
      { tagVocabulary: { tags: tagVocabulary } },
    );
    const nextErrors: SubmissionError[] = validation.valid
      ? []
      : validation.errors.map((message) => ({
          field: manifestErrorField(message),
          message,
        }));
    const addError = (field: SubmissionField, message: string) => {
      if (!nextErrors.some((error) => error.message === message)) {
        nextErrors.push({ field, message });
      }
    };

    if (sourceUrl && !publicHttpsUrl(sourceUrl)) {
      addError("project-url", "Project URL must be a public HTTPS URL.");
    } else if (
      sourceUrl &&
      (projectType === "frontend" || projectType === "extension") &&
      !repositoryProviderFromUrl(sourceUrl)
    ) {
      addError("project-url", frontendEligibility);
    }
    if (showFrontendFields && includeOtherFrontend) {
      if (!otherFrontendName.trim()) {
        addError("other-frontend-name", "Other frontend name is required.");
      }
      if (!otherFrontendUrl.trim()) {
        addError("other-frontend-url", "Other frontend URL is required.");
      } else if (!publicHttpsUrl(otherFrontendUrl)) {
        addError(
          "other-frontend-url",
          "Other frontend URL must be a public HTTPS source URL.",
        );
      }
    }
    if (
      projectType === "preset" &&
      includeOtherModelFamily &&
      !otherModelFamily.trim()
    ) {
      addError("other-model-family", "Other model family name is required.");
    }
    if (nextErrors.length > 0) {
      setErrors(nextErrors);
      return null;
    }
    setErrors([]);
    return validation.valid ? validation.manifest : null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const manifest = buildManifest();
    if (!manifest) return;
    setReviewManifest(manifest);
  }

  async function openReview() {
    const manifest = buildManifest();
    if (!manifest) {
      throw new Error(
        "The project submission changed and needs another Tavernary review.",
      );
    }
    setReviewManifest(manifest);
    return openProjectSubmission(projectSubmissionUrl, manifest);
  }

  async function copyReviewUrl() {
    const manifest = buildManifest();
    if (!manifest) {
      throw new Error(
        "The project submission changed and needs another Tavernary review.",
      );
    }
    setReviewManifest(manifest);
    return copyProjectSubmissionUrl(projectSubmissionUrl, manifest);
  }

  if (reviewManifest) {
    const selectedFrontendLabels = [
      ...reviewManifest.frontends.known_ids.map(
        (id) => frontends.find((frontend) => frontend.id === id)?.label ?? id,
      ),
      ...reviewManifest.frontends.other.map(({ name, url }) =>
        [name, url].filter(Boolean).join(" — "),
      ),
    ];
    const summary =
      reviewManifest.metadata.summary.mode === "manual"
        ? reviewManifest.metadata.summary.value
        : "TavernAI will draft this from repository evidence.";
    const tagValues =
      reviewManifest.metadata.tags.mode === "manual"
        ? reviewManifest.metadata.tags.values.map((id) =>
            vocabularyLabel(tagVocabulary, id),
          )
        : [];
    const compatibilityRows =
      reviewManifest.project_type === "preset"
        ? [
            {
              label: "Model families",
              value: [
                ...(reviewManifest.preset_compatibility?.model_families.known_ids.map(
                  (id) =>
                    vocabularyLabel(modelFamilyVocabulary.model_families, id),
                ) ?? []),
                ...(reviewManifest.preset_compatibility?.model_families.other ??
                  []),
              ].join(", "),
            },
            {
              label: "Completion formats",
              value:
                reviewManifest.preset_compatibility?.completion_formats
                  .map((id) =>
                    id === "chat-completion"
                      ? "Chat Completion"
                      : "Text Completion",
                  )
                  .join(", ") ?? "",
            },
          ]
        : [];

    return (
      <SubmissionReview
        title="Review your project submission"
        introduction={
          <p>
            Tavernary will use this manifest as the authoritative submission.
            GitHub will open next as a readable review and issue-creation step.
          </p>
        }
        returnFocusId="project-type"
        onBack={() => setReviewManifest(null)}
        onCancel={() => setReviewManifest(null)}
        openReview={openReview}
        copyReviewUrl={copyReviewUrl}
        rows={[
          {
            label: "Project Type",
            value: projectTypeLabel(reviewManifest.project_type),
          },
          { label: "Project URL", value: reviewManifest.source_url },
          {
            label: "Primary function",
            value: vocabularyLabel(
              primaryFunctionVocabulary.primary_functions,
              reviewManifest.primary_function,
            ),
          },
          {
            label: "Description choice",
            value:
              reviewManifest.metadata.summary.mode === "manual"
                ? "Write the description myself"
                : "Let TavernAI write the description",
          },
          { label: "Description", value: summary },
          {
            label: "Tag choice",
            value:
              reviewManifest.metadata.tags.mode === "manual"
                ? "Set tags myself"
                : "Let Tavernary select tags",
          },
          {
            label: "Tags",
            value:
              reviewManifest.metadata.tags.mode === "manual"
                ? tagValues.join(", ")
                : "Tavernary will select tags from repository evidence.",
          },
          {
            label: "Supported frontends",
            value:
              reviewManifest.project_type === "frontend"
                ? "Not applicable — this project is a frontend."
                : reviewManifest.frontend_independent
                  ? "Frontend-independent"
                  : selectedFrontendLabels.join(", ") || "None selected",
          },
          ...compatibilityRows,
          {
            label: "Additional context",
            value: reviewManifest.additional_context || "None provided",
          },
        ]}
      />
    );
  }

  return (
    <form className="submission-form" onSubmit={handleSubmit} noValidate>
      <section className="submission-section">
        <div className="submission-field">
          <label htmlFor="project-type">Project Type</label>
          <select
            id="project-type"
            value={projectType}
            required
            aria-invalid={Boolean(errorFor("project-type"))}
            aria-describedby={
              errorFor("project-type") ? "project-type-error" : undefined
            }
            onChange={(event) => {
              setProjectType(event.target.value as ProjectSubmissionType | "");
              setPrimaryFunction("");
              setTags([]);
              setFrontendIndependent(false);
              setModelFamilies([]);
              setIncludeOtherModelFamily(false);
              setOtherModelFamily("");
              setCompletionFormats([]);
              setErrors([]);
            }}
          >
            <option value="">Select a project type</option>
            <option value="frontend">Frontend</option>
            <option value="extension">Extension</option>
            <option value="preset">System Preset</option>
          </select>
          <InlineError
            id="project-type-error"
            message={errorFor("project-type")}
          />
        </div>

        {projectType === "extension" ? (
          <DescribedSelect
            id="project-primary-function"
            label="Primary function"
            value={primaryFunction}
            placeholder="Select a primary function"
            options={extensionPrimaryFunctions}
            onChange={setPrimaryFunction}
            required
            invalid={Boolean(errorFor("primary-function"))}
            error={errorFor("primary-function")}
          />
        ) : null}

        <div className="submission-field">
          <label htmlFor="project-url">Project URL</label>
          <input
            id="project-url"
            type="url"
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://github.com/owner/repository or https://codeberg.org/owner/repository"
            required
            aria-invalid={Boolean(errorFor("project-url"))}
            aria-describedby={
              errorFor("project-url")
                ? "project-url-hint project-url-error"
                : "project-url-hint"
            }
          />
          <p className="submission-hint" id="project-url-hint">
            {projectType === "frontend" || projectType === "extension"
              ? frontendEligibility
              : projectType === "preset"
                ? "System Presets may use a stable public HTTPS source URL."
                : "Choose a project type to see its source requirements."}
          </p>
          <InlineError
            id="project-url-error"
            message={errorFor("project-url")}
          />
        </div>

        <DescribedSelect
          id="project-summary-choice"
          label="Description choice"
          value={summaryMode}
          placeholder="Choose how the description is written"
          options={summaryChoices}
          onChange={(value) => setSummaryMode(value as "automatic" | "manual")}
        />
        <p className="submission-hint" id="project-description-authority">
          Only the verified repository owner or trusted Tavernary staff can set
          this description. If you are not the owner, leave this set to Let
          TavernAI write the description; any description you enter will be
          ignored.
        </p>
        {summaryMode === "automatic" ? (
          <p className="submission-hint">
            TavernAI writes the description from the root README first and the
            repository&apos;s GitHub description second.
          </p>
        ) : (
          <div className="submission-field">
            <label htmlFor="project-description">Short description</label>
            <textarea
              id="project-description"
              value={description}
              maxLength={220}
              onChange={(event) => {
                const sanitized = stripEmoji(event.target.value);
                setDescription(sanitized.value);
                if (sanitized.removed) setEmojiNotice(true);
              }}
              rows={4}
              required
              aria-invalid={Boolean(errorFor("project-description"))}
              aria-describedby={
                errorFor("project-description")
                  ? "project-description-authority project-description-hint project-description-count project-description-error"
                  : "project-description-authority project-description-hint project-description-count"
              }
            />
            <p className="submission-hint" id="project-description-count">
              {description.length}/220 characters
            </p>
            <p className="submission-hint" id="project-description-hint">
              {CATALOG_DESCRIPTION_GUIDANCE}{" "}
              <Link href={CATALOG_POLICY_ROUTE}>Catalog Policy</Link>
            </p>
            {emojiNotice ? (
              <p
                className="submission-hint"
                id="project-description-emoji-status"
                role="status"
                aria-live="polite"
              >
                {CATALOG_EMOJI_REMOVED_NOTICE}
              </p>
            ) : null}
            <InlineError
              id="project-description-error"
              message={errorFor("project-description")}
            />
          </div>
        )}

        <DescribedSelect
          id="project-tag-choice"
          label="Tag choice"
          value={tagMode}
          placeholder="Choose how tags are selected"
          options={tagChoices}
          onChange={(value) => setTagMode(value as "automatic" | "manual")}
        />
        <p className="submission-hint">
          Only the verified repository owner or trusted Tavernary staff can set
          these tags. If you are not the owner, leave this set to Let Tavernary
          select tags; any tags you select will be ignored.
        </p>
        {tagMode === "manual" ? (
          <div className="submission-field">
            <span className="submission-field-label">Goals and traits</span>
            <TagBrowser
              tags={applicableTags}
              selected={tags}
              onToggle={(id) =>
                setTags((current) =>
                  current.includes(id)
                    ? current.filter((tag) => tag !== id)
                    : [...current, id],
                )
              }
              previewLimit={TAG_FACET_PREVIEW_LIMIT}
              maxSelections={6}
              searchLabel="Search goals and traits"
              limitLabel="Up to six"
            />
            <InlineError
              id="project-tags-error"
              message={errorFor("project-tags")}
            />
          </div>
        ) : null}
      </section>

      {projectType === "preset" ? (
        <section className="submission-section">
          <label className="submission-toggle">
            <input
              type="checkbox"
              aria-label="Frontend-independent"
              checked={frontendIndependent}
              onChange={(event) => setFrontendIndependent(event.target.checked)}
            />
            <span>
              <strong>Frontend-independent</strong>
              <small>
                This preset works without depending on a particular frontend.
              </small>
            </span>
          </label>
          {frontendIndependent ? (
            <p className="submission-confirmation">
              No frontend selection required.
            </p>
          ) : null}
        </section>
      ) : null}

      {projectType === "preset" ? (
        <section className="submission-section">
          <div className="submission-section-heading">
            <div>
              <h2>Supported model families</h2>
              <p>
                Select Model-Agnostic for broad usability, plus every model
                family this Preset is tested with or recommended for.
              </p>
            </div>
            <span>{modelFamilies.length} selected</span>
          </div>
          <fieldset className="submission-options">
            <legend className="visually-hidden">
              Supported model families
            </legend>
            {modelFamilyVocabulary.model_families.map((family) => (
              <label key={family.id}>
                <input
                  type="checkbox"
                  aria-label={family.label}
                  checked={modelFamilies.includes(family.id)}
                  onChange={() => toggleModelFamily(family.id)}
                />
                <span>
                  <strong>{family.label}</strong>
                  <small>{family.description}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="submission-toggle">
            <input
              type="checkbox"
              aria-label="Other model family"
              checked={includeOtherModelFamily}
              onChange={(event) => {
                const checked = event.target.checked;
                setIncludeOtherModelFamily(checked);
                if (!checked) {
                  setOtherModelFamily("");
                }
              }}
            />
            <span>
              <strong>Other or not listed</strong>
              <small>
                Request maintainer review for a family missing from this list.
              </small>
            </span>
          </label>
          {includeOtherModelFamily ? (
            <div className="submission-field">
              <label htmlFor="other-model-family">
                Other model family name
              </label>
              <input
                id="other-model-family"
                value={otherModelFamily}
                maxLength={60}
                aria-invalid={Boolean(errorFor("other-model-family"))}
                aria-describedby={
                  errorFor("other-model-family")
                    ? "other-model-family-error"
                    : undefined
                }
                onChange={(event) => setOtherModelFamily(event.target.value)}
              />
              <InlineError
                id="other-model-family-error"
                message={errorFor("other-model-family")}
              />
            </div>
          ) : null}
          <fieldset className="submission-options">
            <legend>Completion format</legend>
            {[
              ["chat-completion", "Chat Completion"],
              ["text-completion", "Text Completion"],
            ].map(([id, label]) => (
              <label key={id}>
                <input
                  type="checkbox"
                  aria-label={label}
                  checked={completionFormats.includes(id)}
                  onChange={() => toggleCompletionFormat(id)}
                />
                <span>
                  <strong>{label}</strong>
                </span>
              </label>
            ))}
          </fieldset>
          <InlineError
            id="preset-compatibility-error"
            message={errorFor("preset-compatibility")}
          />
        </section>
      ) : null}

      {showFrontendFields ? (
        <section className="submission-section">
          <div className="submission-section-heading">
            <div>
              <h2>Supported frontends</h2>
              <p>Select every frontend this project supports.</p>
            </div>
            <span>{knownFrontendIds.length} selected</span>
          </div>

          <div className="submission-field">
            <label htmlFor="frontend-search">Search supported frontends</label>
            <input
              id="frontend-search"
              type="search"
              role="combobox"
              aria-expanded="true"
              aria-controls="submission-frontend-options"
              value={frontendSearch}
              onChange={(event) => setFrontendSearch(event.target.value)}
              placeholder="Search names or URLs"
              aria-invalid={Boolean(errorFor("frontend-selection"))}
              aria-describedby={
                errorFor("frontend-selection")
                  ? "frontend-selection-error"
                  : undefined
              }
            />
            <InlineError
              id="frontend-selection-error"
              message={errorFor("frontend-selection")}
            />
          </div>

          {selectedFrontends.length > 0 ? (
            <div className="submission-chips" aria-label="Selected frontends">
              {selectedFrontends.map((frontend) => (
                <button
                  key={frontend.id}
                  type="button"
                  onClick={() => toggleFrontend(frontend.id)}
                  aria-label={`Remove ${frontend.label}`}
                >
                  {frontend.label} <span aria-hidden="true">×</span>
                </button>
              ))}
            </div>
          ) : null}

          <fieldset
            className="submission-options"
            id="submission-frontend-options"
          >
            <legend className="visually-hidden">Available frontends</legend>
            {filteredFrontends.map((frontend) => (
              <label key={frontend.id}>
                <input
                  type="checkbox"
                  aria-label={frontend.label}
                  checked={knownFrontendIds.includes(frontend.id)}
                  onChange={() => toggleFrontend(frontend.id)}
                />
                <span>
                  <strong>{frontend.label}</strong>
                  <small>{frontend.canonicalUrl}</small>
                </span>
              </label>
            ))}
            {filteredFrontends.length === 0 ? (
              <p>No current frontends match that search.</p>
            ) : null}
          </fieldset>

          <label className="submission-toggle">
            <input
              type="checkbox"
              aria-label="Other or not listed"
              checked={includeOtherFrontend}
              onChange={(event) =>
                setIncludeOtherFrontend(event.target.checked)
              }
            />
            <span>
              <strong>Other or not listed</strong>
              <small>Tell us about a frontend missing from the catalog.</small>
            </span>
          </label>

          {includeOtherFrontend ? (
            <>
              <p className="submission-hint">{frontendEligibility}</p>
              <p className="submission-hint">
                This project will stay blocked until the missing frontend is
                submitted, reviewed, and merged.
              </p>
              <div className="submission-other-fields">
                <div className="submission-field">
                  <label htmlFor="other-frontend-name">
                    Other frontend name
                  </label>
                  <input
                    id="other-frontend-name"
                    value={otherFrontendName}
                    onChange={(event) =>
                      setOtherFrontendName(event.target.value)
                    }
                    aria-invalid={Boolean(errorFor("other-frontend-name"))}
                    aria-describedby={
                      errorFor("other-frontend-name")
                        ? "other-frontend-name-error"
                        : undefined
                    }
                  />
                  <InlineError
                    id="other-frontend-name-error"
                    message={errorFor("other-frontend-name")}
                  />
                </div>
                <div className="submission-field">
                  <label htmlFor="other-frontend-url">Other frontend URL</label>
                  <input
                    id="other-frontend-url"
                    type="url"
                    value={otherFrontendUrl}
                    onChange={(event) =>
                      setOtherFrontendUrl(event.target.value)
                    }
                    aria-invalid={Boolean(errorFor("other-frontend-url"))}
                    aria-describedby={
                      errorFor("other-frontend-url")
                        ? "other-frontend-url-error"
                        : undefined
                    }
                  />
                  <InlineError
                    id="other-frontend-url-error"
                    message={errorFor("other-frontend-url")}
                  />
                </div>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      <section className="submission-section">
        <div className="submission-field">
          <label htmlFor="additional-context">
            Anything we should know? (optional)
          </label>
          <textarea
            id="additional-context"
            value={additionalContext}
            onChange={(event) => setAdditionalContext(event.target.value)}
            rows={4}
          />
        </div>
      </section>

      {errors.length > 0 ? (
        <div className="submission-errors" role="alert">
          <p>Please fix the highlighted fields before continuing.</p>
        </div>
      ) : null}

      <div className="submission-actions">
        <button type="submit">Review submission</button>
        <p>
          Review the complete Tavernary submission before opening GitHub to
          create the issue.
        </p>
      </div>
    </form>
  );
}

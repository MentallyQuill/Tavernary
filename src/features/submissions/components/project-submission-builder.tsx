"use client";

import { useMemo, useState } from "react";

import {
  normalizeProjectSubmissionManifest,
  type ProjectSubmissionManifest,
  type ProjectSubmissionType,
} from "../project-submission-manifest.mjs";
import { openProjectSubmission } from "../submission-transport";

const projectSubmissionUrl =
  "https://github.com/MentallyQuill/Tavernary/issues/new";

export interface SubmissionFrontendOption {
  id: string;
  label: string;
  canonicalUrl: string;
}

type SubmissionField =
  | "project-url"
  | "project-name"
  | "project-description"
  | "frontend-selection"
  | "other-frontend-name"
  | "other-frontend-url";

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

function isGithubRepositoryUrl(value: string): boolean {
  const url = publicHttpsUrl(value);
  if (!url || url.hostname.toLowerCase() !== "github.com") return false;
  const parts = url.pathname
    .replace(/\/+$/u, "")
    .replace(/\.git$/iu, "")
    .split("/")
    .filter(Boolean);
  return parts.length === 2;
}

function isExternalPreset(
  projectType: ProjectSubmissionType,
  sourceUrl: string,
) {
  if (projectType !== "preset") return false;
  return Boolean(sourceUrl.trim()) && !isGithubRepositoryUrl(sourceUrl);
}

function manifestErrorField(message: string): SubmissionField {
  if (message.includes("project name")) return "project-name";
  if (message.includes("short description")) return "project-description";
  if (
    message.includes("supported frontend") ||
    message.includes("frontend-independent")
  ) {
    return "frontend-selection";
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
}: {
  frontends: SubmissionFrontendOption[];
}) {
  const [projectType, setProjectType] =
    useState<ProjectSubmissionType>("frontend");
  const [sourceUrl, setSourceUrl] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [frontendSearch, setFrontendSearch] = useState("");
  const [knownFrontendIds, setKnownFrontendIds] = useState<string[]>([]);
  const [includeOtherFrontend, setIncludeOtherFrontend] = useState(false);
  const [otherFrontendName, setOtherFrontendName] = useState("");
  const [otherFrontendUrl, setOtherFrontendUrl] = useState("");
  const [frontendIndependent, setFrontendIndependent] = useState(false);
  const [errors, setErrors] = useState<SubmissionError[]>([]);
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<"success" | "error" | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);

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
  const externalPreset = isExternalPreset(projectType, sourceUrl);
  const errorFor = (field: SubmissionField) =>
    errors.find((error) => error.field === field)?.message;

  function toggleFrontend(id: string) {
    setKnownFrontendIds((current) =>
      current.includes(id)
        ? current.filter((frontendId) => frontendId !== id)
        : [...current, id],
    );
  }

  function buildManifest(): ProjectSubmissionManifest | null {
    const activeFrontends =
      projectType === "frontend" || frontendIndependent
        ? { known_ids: [], other: [] }
        : {
            known_ids: knownFrontendIds,
            other: includeOtherFrontend
              ? [{ name: otherFrontendName, url: otherFrontendUrl }]
              : [],
          };
    const validation = normalizeProjectSubmissionManifest({
      schema_version: 1,
      project_type: projectType,
      source_url: sourceUrl,
      name,
      description,
      frontends: activeFrontends,
      frontend_independent: projectType === "preset" && frontendIndependent,
      additional_context: additionalContext,
    });
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
      ["frontend", "extension"].includes(projectType) &&
      !isGithubRepositoryUrl(sourceUrl)
    ) {
      addError(
        "project-url",
        "Frontends and Extensions require an exact public GitHub owner/repository URL.",
      );
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
          "Other frontend URL must be a public HTTPS URL.",
        );
      }
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
    setStatus("");
    setStatusKind(null);
    const manifest = buildManifest();
    if (!manifest) return;

    setSubmitting(true);
    try {
      const handoff = await openProjectSubmission(
        projectSubmissionUrl,
        manifest,
      );
      setStatus(
        handoff === "prefilled"
          ? "GitHub opened with your submission."
          : "GitHub opened. Paste the copied manifest into the form.",
      );
      setStatusKind("success");
    } catch {
      setStatus("Tavernary could not open GitHub. Please try again.");
      setStatusKind("error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="submission-form" onSubmit={handleSubmit} noValidate>
      <section className="submission-section">
        <div className="submission-field">
          <label htmlFor="project-type">Project Type</label>
          <select
            id="project-type"
            value={projectType}
            onChange={(event) => {
              setProjectType(event.target.value as ProjectSubmissionType);
              setFrontendIndependent(false);
              setErrors([]);
              setStatus("");
              setStatusKind(null);
            }}
          >
            <option value="frontend">Frontend</option>
            <option value="extension">Extension</option>
            <option value="preset">System Preset</option>
          </select>
        </div>

        <div className="submission-field">
          <label htmlFor="project-url">Project URL</label>
          <input
            id="project-url"
            type="url"
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://github.com/owner/repository"
            required
            aria-invalid={Boolean(errorFor("project-url"))}
            aria-describedby={
              errorFor("project-url")
                ? "project-url-hint project-url-error"
                : "project-url-hint"
            }
          />
          <p className="submission-hint" id="project-url-hint">
            Frontends and Extensions require a public GitHub repository.
          </p>
          <InlineError
            id="project-url-error"
            message={errorFor("project-url")}
          />
        </div>

        <div className="submission-field">
          <label htmlFor="project-name">
            Project Name{externalPreset ? " (required)" : " (optional)"}
          </label>
          <input
            id="project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required={externalPreset}
            aria-invalid={Boolean(errorFor("project-name"))}
            aria-describedby={
              errorFor("project-name") ? "project-name-error" : undefined
            }
          />
          <InlineError
            id="project-name-error"
            message={errorFor("project-name")}
          />
        </div>

        <div className="submission-field">
          <label htmlFor="project-description">
            Short Description{externalPreset ? " (required)" : " (optional)"}
          </label>
          <textarea
            id="project-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            required={externalPreset}
            aria-invalid={Boolean(errorFor("project-description"))}
            aria-describedby={
              errorFor("project-description")
                ? "project-description-error"
                : undefined
            }
          />
          <InlineError
            id="project-description-error"
            message={errorFor("project-description")}
          />
        </div>
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
            <div className="submission-other-fields">
              <div className="submission-field">
                <label htmlFor="other-frontend-name">Other frontend name</label>
                <input
                  id="other-frontend-name"
                  value={otherFrontendName}
                  onChange={(event) => setOtherFrontendName(event.target.value)}
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
                  onChange={(event) => setOtherFrontendUrl(event.target.value)}
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
        <button type="submit" disabled={submitting}>
          {submitting ? "Opening GitHub…" : "Continue to GitHub"}
        </button>
        <p>
          GitHub will show the completed issue for you to review before
          submitting it.
        </p>
      </div>
      <p
        className="submission-status"
        data-status={statusKind ?? undefined}
        role={
          statusKind === "success"
            ? "status"
            : statusKind === "error"
              ? "alert"
              : undefined
        }
        aria-live="polite"
      >
        {status}
      </p>
    </form>
  );
}

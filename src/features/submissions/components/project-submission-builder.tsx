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

function isExternalPreset(
  projectType: ProjectSubmissionType,
  sourceUrl: string,
) {
  if (projectType !== "preset") return false;
  try {
    return new URL(sourceUrl).hostname.toLowerCase() !== "github.com";
  } catch {
    return false;
  }
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
  const [errors, setErrors] = useState<string[]>([]);
  const [status, setStatus] = useState("");
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
    const nextErrors = validation.valid ? [] : validation.errors;

    if (sourceUrl) {
      try {
        const parsedUrl = new URL(sourceUrl);
        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          nextErrors.push("Project URL must use HTTP or HTTPS.");
        }
      } catch {
        nextErrors.push("Project URL must be a valid URL.");
      }
    }
    if (
      showFrontendFields &&
      includeOtherFrontend &&
      (!otherFrontendName.trim() || !otherFrontendUrl.trim())
    ) {
      nextErrors.push("Other frontends require both a name and URL.");
    }
    if (nextErrors.length > 0) {
      setErrors([...new Set(nextErrors)]);
      return null;
    }
    setErrors([]);
    return validation.valid ? validation.manifest : null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
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
    } catch {
      setStatus("Tavernary could not open GitHub. Please try again.");
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
          />
          <p className="submission-hint">
            Frontends and Extensions require a public GitHub repository.
          </p>
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
                />
              </div>
              <div className="submission-field">
                <label htmlFor="other-frontend-url">Other frontend URL</label>
                <input
                  id="other-frontend-url"
                  type="url"
                  value={otherFrontendUrl}
                  onChange={(event) => setOtherFrontendUrl(event.target.value)}
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
          <p>Please fix the following:</p>
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
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
      <p className="submission-status" aria-live="polite">
        {status}
      </p>
    </form>
  );
}

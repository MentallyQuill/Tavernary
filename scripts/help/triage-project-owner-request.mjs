import { readFile as defaultReadFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  normalizeProjectOwnerManifest,
  STALE_TAG_VOCABULARY_ERROR,
} from "../../src/features/help/project-owner-manifest.mjs";
import trustedEditorRegistry from "../../data/maintenance/trusted-tavernary-editors.json" with { type: "json" };
import { verifyTrustedEditor } from "../maintenance/trusted-editor-authority.mjs";
import {
  detectOwnerRequestConflict,
  verifyProjectOwnerAuthority,
} from "./project-owner-authority.mjs";
import { planSourceRequestAdmission } from "./source-request-lock.mjs";

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const PROJECT_OPERATIONS = new Set([
  "edit-card",
  "retire-card",
  "restore-card",
]);
const OWNER_OPERATIONS = new Set([
  ...PROJECT_OPERATIONS,
  "add-cards",
  "move-source",
  "delist-source",
]);
const OWNER_HEADINGS = new Set([
  "Request type",
  "Source ID",
  "Project ID",
  "Current repository",
  "Proposed display name",
  "Proposed summary",
  "Supported frontends",
  "Primary function",
  "Tags",
  "Summary metadata mode",
  "Tag metadata mode",
  "Model families",
  "Completion formats",
  "Proposed repository",
  "Explanation or public note",
  "Delist confirmation",
  "Owner request manifest",
]);

function readable(value = "") {
  const normalized = String(value).trim();
  return /^_No response_$/iu.test(normalized) ? "" : normalized;
}

function issueLabels(issue) {
  return new Set(
    (issue?.labels ?? [])
      .map((label) => (typeof label === "string" ? label : label?.name))
      .filter(Boolean),
  );
}

function eligibleIssue(issue) {
  const labels = issueLabels(issue);
  return (
    String(issue?.state).toLocaleLowerCase() === "open" &&
    labels.has("issue-admitted") &&
    labels.has("project-owner-request")
  );
}

function collectHeadings(body = "") {
  const fields = new Map();
  const duplicates = [];
  for (const section of String(body).split(/^### /mu).slice(1)) {
    const [rawHeading, ...content] = section.split(/\r?\n/u);
    const heading = rawHeading.trim();
    if (!heading) continue;
    if (fields.has(heading) && OWNER_HEADINGS.has(heading)) {
      duplicates.push(heading);
      continue;
    }
    fields.set(heading, readable(content.join("\n")));
  }
  return { fields, duplicates };
}

function renderedJson(value) {
  return (
    value.match(/^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/iu)?.[1] ?? value
  );
}

function preliminary(body) {
  const collected = collectHeadings(body);
  if (collected.duplicates.length > 0) {
    return {
      valid: false,
      errors: ["Owner request contains a duplicate recognized form heading."],
    };
  }
  const manifestValue = collected.fields.get("Owner request manifest") ?? "";
  if (!manifestValue) {
    return {
      valid: false,
      errors: [
        "This owner operation requires the complete generated request manifest.",
      ],
    };
  }
  try {
    return {
      valid: true,
      manifest: JSON.parse(renderedJson(manifestValue)),
    };
  } catch {
    return {
      valid: false,
      errors: ["Owner request manifest is not valid JSON."],
    };
  }
}

function needsInformation(reasonCode, message, extra = {}) {
  return { status: "needs-information", reasonCode, message, ...extra };
}

function temporaryApiFailure(error) {
  const status = Number(error?.status);
  return (
    !Number.isFinite(status) ||
    status === 408 ||
    status === 429 ||
    status >= 500
  );
}

function repositoryIdentity(value) {
  return {
    id: value?.id,
    fullName: value?.fullName ?? value?.full_name,
    htmlUrl: value?.htmlUrl ?? value?.html_url,
    visibility:
      value?.visibility ?? (value?.private === false ? "public" : undefined),
    owner: value?.owner,
  };
}

function issueApiPath(hostRepository, issueNumber) {
  const fullName =
    typeof hostRepository === "string"
      ? hostRepository
      : typeof hostRepository?.owner === "string" &&
          typeof hostRepository?.name === "string"
        ? `${hostRepository.owner}/${hostRepository.name}`
        : "";
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(fullName) ||
    !Number.isSafeInteger(issueNumber) ||
    issueNumber < 1
  ) {
    return null;
  }
  return `/repos/${fullName}/issues/${issueNumber}`;
}

function issueChanged(before, after) {
  return (
    before?.number !== after?.number ||
    before?.updated_at !== after?.updated_at ||
    before?.body !== after?.body ||
    before?.state !== after?.state ||
    JSON.stringify([...issueLabels(before)].sort()) !==
      JSON.stringify([...issueLabels(after)].sort()) ||
    before?.user?.login !== after?.user?.login ||
    before?.user?.id !== after?.user?.id ||
    before?.author_association !== after?.author_association
  );
}

async function readRecord(input, kind, id) {
  const injected = kind === "projects" ? input.project : input.source;
  if (injected) return structuredClone(injected);
  const readFile = input.readFile ?? defaultReadFile;
  return JSON.parse(
    await readFile(
      resolve(input.root ?? ".", "data", "registry", kind, `${id}.json`),
      "utf8",
    ),
  );
}

async function resolveRepositoryIdentity(input, source) {
  if (input.repository) return repositoryIdentity(input.repository);
  if (
    source?.type !== "github" ||
    !Number.isSafeInteger(source.repository_id) ||
    source.repository_id <= 0
  ) {
    return null;
  }
  if (typeof input.request !== "function") {
    const error = new Error("GitHub repository identity could not be checked.");
    error.code = "github-api-temporary-failure";
    throw error;
  }
  return repositoryIdentity(
    await input.request(`/repositories/${source.repository_id}`),
  );
}

function rawIdentifiers(parsed) {
  const operation = parsed.manifest?.operation;
  const projectId = parsed.manifest?.project_id;
  const sourceId = parsed.manifest?.source_id;
  return {
    operation: OWNER_OPERATIONS.has(operation) ? operation : null,
    projectId:
      typeof projectId === "string" && ID_PATTERN.test(projectId)
        ? projectId
        : null,
    sourceId:
      typeof sourceId === "string" && ID_PATTERN.test(sourceId)
        ? sourceId
        : null,
  };
}

export async function processProjectOwnerTriage(input) {
  const issue = input?.issue;
  if (!eligibleIssue(issue)) {
    return needsInformation(
      "issue-not-eligible",
      "Owner request must be open, admitted, and labeled project-owner-request.",
    );
  }
  const parsed = preliminary(issue.body ?? "");
  if (!parsed.valid) {
    return needsInformation("owner-request-invalid", parsed.errors.join(" "), {
      errors: parsed.errors,
    });
  }

  const identifiers = rawIdentifiers(parsed);
  const usesProject = PROJECT_OPERATIONS.has(identifiers.operation);
  if (
    !identifiers.operation ||
    !identifiers.sourceId ||
    (usesProject && !identifiers.projectId)
  ) {
    return needsInformation(
      "owner-request-invalid",
      "Owner request operation, source ID, or required project ID is invalid.",
    );
  }

  let project = null;
  let source = null;
  try {
    if (usesProject) {
      project = await readRecord(input, "projects", identifiers.projectId);
      if (project?.id !== identifiers.projectId) throw new Error("project");
    }
    const sourceId = identifiers.sourceId;
    source = await readRecord(input, "sources", sourceId);
    if (source?.id !== sourceId) throw new Error("source");
    if (project && project.source_id !== source.id) throw new Error("join");
  } catch (error) {
    return needsInformation(
      String(error?.message) === "project"
        ? "project-not-found"
        : "source-not-found",
      "Owner request does not match current card and source records.",
    );
  }

  const normalized = normalizeProjectOwnerManifest(parsed.manifest, {
    ...input.vocabularies,
    source,
  });
  if (!normalized.valid) {
    const staleVocabulary = normalized.errors.includes(
      STALE_TAG_VOCABULARY_ERROR,
    );
    return needsInformation(
      staleVocabulary ? "tag-vocabulary-stale" : "owner-request-invalid",
      normalized.errors.join(" "),
      { errors: normalized.errors },
    );
  }

  if (normalized.manifest.operation === "add-cards") {
    const lock = planSourceRequestAdmission({
      sourceId: source.id,
      issueNumber: issue.number,
      issues: input.issues ?? [],
      pulls: input.pulls ?? [],
    });
    if (lock.action === "reject") {
      return needsInformation(
        lock.reasonCode,
        `Only one unresolved add-card request is allowed for this source. Resolve #${lock.conflictingIssueNumber} first.`,
        { conflictingIssueNumber: lock.conflictingIssueNumber },
      );
    }
  }

  const staffAuthority = verifyTrustedEditor({
    actor: issue.user,
    association: issue.author_association,
    registry: input.trustedEditorRegistry ?? trustedEditorRegistry,
  });
  let repository = null;
  let authority;
  if (staffAuthority.authorized) {
    authority = {
      authorityType: "tavernary-staff",
      actorLogin: staffAuthority.actorLogin,
      role: staffAuthority.role,
    };
    if (normalized.manifest.operation === "move-source") {
      try {
        repository = await resolveRepositoryIdentity(input, source);
      } catch (error) {
        if (temporaryApiFailure(error)) {
          return {
            status: "retryable",
            reasonCode: "github-api-temporary-failure",
            message: "GitHub repository identity could not be checked.",
          };
        }
        return needsInformation(
          "repository-identity-unavailable",
          "The current repository identity could not be verified.",
        );
      }
    }
  } else {
    try {
      repository = await resolveRepositoryIdentity(input, source);
    } catch (error) {
      if (temporaryApiFailure(error)) {
        return {
          status: "retryable",
          reasonCode: "github-api-temporary-failure",
          message: "GitHub repository identity could not be checked.",
        };
      }
      return needsInformation(
        "repository-identity-unavailable",
        "The current repository identity could not be verified.",
      );
    }
    const ownerAuthority = verifyProjectOwnerAuthority({
      issueAuthor: issue.user?.login,
      manifestRepositoryId: normalized.manifest.repository_id,
      source,
      repository: repository ?? {},
    });
    if (!ownerAuthority.authorized) {
      return needsInformation(
        ownerAuthority.reasonCode,
        ownerAuthority.reasonCode === "issue-author-not-owner"
          ? "Only the current personal GitHub repository owner can submit this request."
          : `Owner authority could not be verified: ${ownerAuthority.reasonCode}.`,
      );
    }
    authority = ownerAuthority;
  }

  if (
    normalized.manifest.operation === "move-source" &&
    repository?.fullName?.toLocaleLowerCase() !==
      normalized.manifest.proposed.repository.toLocaleLowerCase()
  ) {
    return needsInformation(
      "repository-location-mismatch",
      "The proposed repository location does not match the current immutable GitHub repository identity.",
    );
  }

  const conflict = detectOwnerRequestConflict({
    manifest: normalized.manifest,
    project,
    source,
  });
  if (conflict.conflict) {
    return needsInformation(
      conflict.reasonCode,
      `Current values changed for: ${conflict.fields.join(", ")}.`,
      { fields: conflict.fields },
    );
  }

  const refreshPath = issueApiPath(input.hostRepository, issue.number);
  if (!refreshPath || typeof input.request !== "function") {
    return {
      status: "retryable",
      reasonCode: "trusted-issue-context-unavailable",
      message:
        "The latest issue cannot be refreshed without trusted repository context.",
    };
  }
  try {
    const refreshed = await input.request(refreshPath);
    if (issueChanged(issue, refreshed)) {
      return {
        status: "retryable",
        reasonCode: "issue-changed-during-triage",
        message: "The issue changed during triage and must be processed again.",
      };
    }
    if (!eligibleIssue(refreshed)) {
      return needsInformation(
        "issue-not-eligible",
        "Owner request is no longer open and admitted.",
      );
    }
  } catch (error) {
    if (temporaryApiFailure(error)) {
      return {
        status: "retryable",
        reasonCode: "github-api-temporary-failure",
        message: "The latest issue state could not be checked.",
      };
    }
    return needsInformation(
      "issue-refresh-failed",
      "The latest issue state could not be verified.",
    );
  }

  const projects = (input.projects ?? (project ? [project] : [])).filter(
    (candidate) => candidate?.source_id === source.id,
  );
  return {
    status: "admitted",
    issueNumber: issue.number,
    projectId: project?.id ?? null,
    projectIds:
      normalized.manifest.operation === "add-cards"
        ? normalized.manifest.proposed_cards.map((card) => card.project_id)
        : project
          ? [project.id]
          : [],
    sourceId: source.id,
    operation: normalized.manifest.operation,
    manifest: normalized.manifest,
    project,
    record: project,
    projects,
    source,
    snapshot: input.snapshot ?? null,
    repository,
    authorityType: authority.authorityType,
    actorLogin: authority.actorLogin,
    ...(authority.authorityType === "repository-owner"
      ? { verifiedOwnerLogin: authority.ownerLogin }
      : { trustedEditorRole: authority.role }),
    warnings: conflict.warnings,
  };
}

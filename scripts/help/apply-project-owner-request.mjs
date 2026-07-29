import { normalizeProjectOwnerManifest } from "../../src/features/help/project-owner-manifest.mjs";
import {
  fingerprintProjectRecord,
  fingerprintSourceRecord,
} from "../../src/features/help/project-owner-record.mjs";

const PROJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const PROJECT_OPERATIONS = new Set([
  "edit-card",
  "retire-card",
  "restore-card",
]);
const SOURCE_OPERATIONS = new Set([
  "add-cards",
  "move-source",
  "delist-source",
]);
const EDITABLE_FIELDS = [
  "name",
  "summary",
  "frontends",
  "primary_function",
  "tags",
  "model_families",
  "completion_formats",
];

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function requirePositiveInteger(value, message) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    fail("owner-request-invalid", message);
  }
}

function projectPath(id) {
  return `data/registry/projects/${id}.json`;
}

function sourcePath(id) {
  return `data/registry/sources/${id}.json`;
}

function snapshotPath(id) {
  return `data/snapshots/github/${id}.json`;
}

function currentProject(projects, projectId) {
  const matches = projects.filter((project) => project?.id === projectId);
  if (matches.length !== 1) {
    fail(
      "owner-request-invalid",
      "Owner request project does not match exactly one current registry record.",
    );
  }
  return matches[0];
}

function normalizeManifest(input) {
  const normalized = normalizeProjectOwnerManifest(input?.manifest, {
    ...input?.vocabularies,
    source: {
      id: input?.source?.id,
      type: input?.source?.type,
      repository: input?.source?.repository,
      repository_id: input?.source?.repository_id,
    },
  });
  if (!normalized.valid) {
    fail("owner-request-invalid", normalized.errors.join(" "));
  }
  return normalized.manifest;
}

function requireCurrentSource(manifest, source) {
  if (
    !source ||
    source.schema_version !== 1 ||
    source.type !== "github" ||
    source.id !== manifest.source_id ||
    source.repository_id !== manifest.repository_id
  ) {
    fail(
      "repository-identity-mismatch",
      "Owner request source identity does not match the current registry source.",
    );
  }
}

function requireOperationFingerprint(manifest, projects, source) {
  if (PROJECT_OPERATIONS.has(manifest.operation)) {
    const project = currentProject(projects, manifest.project_id);
    if (fingerprintProjectRecord(project) !== manifest.project_fingerprint) {
      fail(
        "project-fingerprint-stale",
        "Owner request project fingerprint does not match the current card.",
      );
    }
    return project;
  }
  if (
    SOURCE_OPERATIONS.has(manifest.operation) &&
    fingerprintSourceRecord(source) !== manifest.source_fingerprint
  ) {
    fail(
      "source-fingerprint-stale",
      "Owner request source fingerprint does not match the current source.",
    );
  }
  return null;
}

function metadataPolicy(metadata, issueNumber) {
  return {
    summary:
      metadata.summary.mode === "manual"
        ? {
            mode: "manual",
            note: `Owner-authored summary approved through issue #${issueNumber}.`,
          }
        : { mode: "automatic" },
    tags:
      metadata.tags.mode === "manual"
        ? {
            mode: "manual",
            note: `Owner-authored tags approved through issue #${issueNumber}.`,
          }
        : { mode: "automatic" },
  };
}

function cardFromDraft(input, draft) {
  const record = {
    schema_version: 6,
    id: draft.project_id,
    name: draft.name,
    kind: draft.kind,
    summary: draft.summary,
    metadata_status: "curated",
    source_id: input.source.id,
    frontends: structuredClone(draft.frontends),
    primary_function: draft.primary_function,
    tags: structuredClone(draft.tags),
    metadata_policy: metadataPolicy(draft.metadata, input.issueNumber),
    ...(draft.kind === "preset"
      ? {
          model_families: structuredClone(draft.model_families),
          completion_formats: structuredClone(draft.completion_formats),
        }
      : {}),
    cataloged_at: input.catalogedAt,
    catalog_cohort: "standard",
    listing_status: "active",
    listing_status_reason: null,
  };
  if (
    typeof record.cataloged_at !== "string" ||
    !Number.isFinite(new Date(record.cataloged_at).getTime())
  ) {
    fail(
      "owner-request-invalid",
      "Add-card generation requires a valid catalog timestamp.",
    );
  }
  return record;
}

function applyCardEdit(input, manifest, project) {
  if (project.kind !== manifest.original.kind) {
    fail(
      "stale-owner-request",
      "stale-owner-request: the current project kind changed.",
    );
  }
  const updated = structuredClone(project);
  for (const field of EDITABLE_FIELDS) {
    if (field === "model_families" || field === "completion_formats") {
      if (project.kind !== "preset") {
        delete updated[field];
        continue;
      }
    }
    updated[field] = structuredClone(manifest.proposed[field]);
  }
  if (
    manifest.original.summary !== manifest.proposed.summary &&
    input.publishedSummary !== undefined
  ) {
    if (
      typeof input.publishedSummary !== "string" ||
      input.publishedSummary.length < 1 ||
      input.publishedSummary.length > 220
    ) {
      fail(
        "owner-request-invalid",
        "Published owner summary must be one to 220 characters.",
      );
    }
    updated.summary = input.publishedSummary;
  }
  updated.metadata_status = "curated";
  updated.metadata_policy = metadataPolicy(
    manifest.proposed.metadata,
    input.issueNumber,
  );
  return {
    projects: [updated],
    source: structuredClone(input.source),
    snapshot: structuredClone(input.snapshot ?? null),
    changedPaths: [projectPath(project.id)],
    before: structuredClone(project),
    after: structuredClone(updated),
  };
}

function applyAddCards(input, manifest) {
  if (input.source.status !== "active") {
    fail(
      "source-delisted",
      "Additional cards cannot be added to a delisted source.",
    );
  }
  const existingIds = new Set(input.projects.map((project) => project.id));
  for (const draft of manifest.proposed_cards) {
    if (existingIds.has(draft.project_id)) {
      fail(
        "project-id-collision",
        `Owner add-card project ID already exists: ${draft.project_id}`,
      );
    }
    existingIds.add(draft.project_id);
  }
  const projects = manifest.proposed_cards
    .map((draft) => cardFromDraft(input, draft))
    .sort((left, right) => left.id.localeCompare(right.id));
  return {
    projects,
    source: structuredClone(input.source),
    snapshot: structuredClone(input.snapshot ?? null),
    changedPaths: projects.map((project) => projectPath(project.id)),
    before: [],
    after: structuredClone(projects),
  };
}

function applyCardLifecycle(input, manifest, project) {
  if (
    manifest.operation === "restore-card" &&
    input.source.status !== "active"
  ) {
    fail(
      "source-delisted",
      "A card cannot be restored from a delisted source.",
    );
  }
  const updated = {
    ...structuredClone(project),
    listing_status: manifest.proposed.listing_status,
    listing_status_reason: manifest.proposed.listing_status_reason,
  };
  return {
    projects: [updated],
    source: structuredClone(input.source),
    snapshot: structuredClone(input.snapshot ?? null),
    changedPaths: [projectPath(project.id)],
    before: structuredClone(manifest.original),
    after: structuredClone(manifest.proposed),
  };
}

function normalizedRepositoryName(repository) {
  if (typeof repository?.fullName !== "string") return null;
  const parts = repository.fullName.split("/");
  if (
    parts.length !== 2 ||
    parts.some((part) => !part || /\s/u.test(part)) ||
    typeof repository.htmlUrl !== "string" ||
    !repository.htmlUrl
  ) {
    return null;
  }
  return { owner: parts[0], name: parts[1] };
}

function normalizedGitHubRepositoryUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    if (
      url.protocol !== "https:" ||
      url.hostname.toLocaleLowerCase() !== "github.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      parts.length !== 2
    ) {
      return null;
    }
    return `${parts[0]}/${parts[1]}`.toLocaleLowerCase();
  } catch {
    return null;
  }
}

function applySourceMove(input, manifest) {
  if (input.source.status !== "active") {
    fail("source-delisted", "A delisted source cannot be moved.");
  }
  const repository = input.repository;
  const location = normalizedRepositoryName(repository);
  requirePositiveInteger(
    repository?.id,
    "Source move must retain the immutable repository ID.",
  );
  if (
    repository.id !== manifest.repository_id ||
    repository.id !== input.source.repository_id ||
    repository.id !== input.snapshot?.repository?.id
  ) {
    fail(
      "repository-identity-mismatch",
      "Source move must retain the same immutable repository ID.",
    );
  }
  if (
    !location ||
    repository.fullName.toLocaleLowerCase() !==
      manifest.proposed.repository.toLocaleLowerCase()
  ) {
    fail(
      "owner-request-invalid",
      "Source move must match the current location of the same repository.",
    );
  }
  if (
    input.snapshot?.provider !== "github" ||
    input.snapshot.source_id !== input.source.id ||
    typeof input.snapshot.repository !== "object"
  ) {
    fail(
      "owner-request-invalid",
      "Source move requires the matching source-owned GitHub snapshot.",
    );
  }
  const expectedLocation = input.source.repository.toLocaleLowerCase();
  const snapshotLocation =
    typeof input.snapshot.repository.owner === "string" &&
    typeof input.snapshot.repository.name === "string"
      ? `${input.snapshot.repository.owner}/${input.snapshot.repository.name}`.toLocaleLowerCase()
      : null;
  if (
    snapshotLocation !== expectedLocation ||
    normalizedGitHubRepositoryUrl(input.snapshot.repository.url) !==
      expectedLocation
  ) {
    fail(
      "owner-request-invalid",
      "Source move snapshot location does not match the current registry source.",
    );
  }
  const source = {
    ...structuredClone(input.source),
    repository: repository.fullName,
  };
  const snapshot = {
    ...structuredClone(input.snapshot),
    repository: {
      ...structuredClone(input.snapshot.repository),
      owner: repository.owner?.login ?? location.owner,
      name: location.name,
      url: repository.htmlUrl,
    },
  };
  return {
    projects: [],
    source,
    snapshot,
    changedPaths: [sourcePath(source.id), snapshotPath(source.id)],
    before: structuredClone(manifest.original),
    after: {
      repository: source.repository,
      repository_id: source.repository_id,
    },
  };
}

function applyDelistSource(input, manifest) {
  if (input.source.status !== "active") {
    fail("source-delisted", "The source is already delisted.");
  }
  const source = {
    ...structuredClone(input.source),
    status: "delisted",
    status_reason: "removed",
    refresh_policy: "paused",
  };
  return {
    projects: [],
    source,
    snapshot: structuredClone(input.snapshot ?? null),
    changedPaths: [sourcePath(source.id)],
    before: structuredClone(manifest.original),
    after: structuredClone(manifest.proposed),
  };
}

export function assertProjectOwnerRequestApplicable(input) {
  requirePositiveInteger(
    input?.issueNumber,
    "Owner request issue number must be a positive integer.",
  );
  if (!Array.isArray(input?.projects)) {
    fail("owner-request-invalid", "Owner request requires current projects.");
  }
  const ids = input.projects.map((project) => project?.id);
  if (
    ids.some((id) => !PROJECT_ID_PATTERN.test(id ?? "")) ||
    new Set(ids).size !== ids.length
  ) {
    fail(
      "owner-request-invalid",
      "Current project IDs are invalid or duplicate.",
    );
  }
  const manifest = normalizeManifest(input);
  requireCurrentSource(manifest, input.source);
  const project = requireOperationFingerprint(
    manifest,
    input.projects,
    input.source,
  );
  return { manifest, project };
}

export function applyProjectOwnerRequest(input) {
  const { manifest, project } = assertProjectOwnerRequestApplicable(input);
  if (manifest.operation === "edit-card") {
    return applyCardEdit(input, manifest, project);
  }
  if (manifest.operation === "add-cards") {
    return applyAddCards(input, manifest);
  }
  if (
    manifest.operation === "retire-card" ||
    manifest.operation === "restore-card"
  ) {
    return applyCardLifecycle(input, manifest, project);
  }
  if (manifest.operation === "move-source") {
    return applySourceMove(input, manifest);
  }
  return applyDelistSource(input, manifest);
}

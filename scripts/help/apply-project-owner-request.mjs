import { normalizeProjectOwnerManifest } from "../../src/features/help/project-owner-manifest.mjs";
import { detectOwnerRequestConflict } from "./project-owner-authority.mjs";

const PROJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const EDITABLE_FIELDS = [
  "name",
  "summary",
  "frontends",
  "primary_function",
  "capabilities",
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

function requireCurrentRecord(manifest, record) {
  if (
    !record ||
    typeof record !== "object" ||
    !PROJECT_ID_PATTERN.test(record.id) ||
    record.id !== manifest.project_id
  ) {
    fail(
      "owner-request-invalid",
      "Owner request project does not match the current registry record.",
    );
  }
  if (manifest.operation === "move-source") {
    if (
      record.source?.type !== "github" ||
      record.source.repository_id !== manifest.repository_id
    ) {
      fail(
        "repository-identity-mismatch",
        "Owner request immutable repository ID does not match the current registry record.",
      );
    }
    return;
  }
  const repositoryId =
    record.source?.type === "github" &&
    Number.isSafeInteger(record.source.repository_id) &&
    record.source.repository_id > 0
      ? record.source.repository_id
      : null;
  if (repositoryId !== manifest.repository_id) {
    fail(
      "repository-identity-mismatch",
      "Owner request immutable repository ID does not match the current registry record.",
    );
  }
}

function normalizeManifest(input) {
  const normalized = normalizeProjectOwnerManifest(
    input?.manifest,
    input?.vocabularies,
  );
  if (!normalized.valid) {
    fail("owner-request-invalid", normalized.errors.join(" "));
  }
  return normalized.manifest;
}

function registryPath(record) {
  return `data/registry/projects/${record.id}.json`;
}

function snapshotPath(record) {
  return `data/snapshots/github/${record.id}.json`;
}

function relevantEditValues(record) {
  return {
    ...Object.fromEntries(
      EDITABLE_FIELDS.flatMap((field) =>
        Object.hasOwn(record, field)
          ? [[field, structuredClone(record[field])]]
          : [],
      ),
    ),
    metadata_status: record.metadata_status,
    refresh_policy: record.refresh_policy,
    enrichment_policy: record.enrichment_policy,
    ...(record.enrichment_note === undefined
      ? {}
      : { enrichment_note: record.enrichment_note }),
  };
}

function applyCardEdit(input, manifest, record, snapshot) {
  if (record.kind !== manifest.original.kind) {
    fail(
      "stale-owner-request",
      "stale-owner-request: the current project kind changed.",
    );
  }
  const before = relevantEditValues(record);
  const updated = { ...record };
  const manuallyCurated = ["summary", "capabilities"].some(
    (field) =>
      JSON.stringify(manifest.original[field]) !==
      JSON.stringify(manifest.proposed[field]),
  );
  for (const field of EDITABLE_FIELDS) {
    if (
      JSON.stringify(manifest.original[field]) ===
      JSON.stringify(manifest.proposed[field])
    ) {
      continue;
    }
    if (field === "model_families" || field === "completion_formats") {
      if (record.kind !== "preset") continue;
    }
    updated[field] = structuredClone(manifest.proposed[field]);
  }
  if (manuallyCurated) {
    updated.metadata_status = "curated";
    updated.enrichment_policy = "manual";
    updated.enrichment_note = `Owner-authored catalog details approved through issue #${input.issueNumber}.`;
  }
  return {
    record: updated,
    snapshot,
    changedPaths: [registryPath(record)],
    before,
    after: relevantEditValues(updated),
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

function applySourceMove(input, manifest, record, snapshot) {
  const repository = input.repository;
  const location = normalizedRepositoryName(repository);
  requirePositiveInteger(
    repository?.id,
    "Source move must retain the immutable repository ID.",
  );
  if (
    repository.id !== manifest.repository_id ||
    repository.id !== record.source.repository_id ||
    repository.id !== snapshot?.repository?.id
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
    snapshot?.provider !== "github" ||
    snapshot.project_id !== record.id ||
    typeof snapshot.repository !== "object"
  ) {
    fail(
      "owner-request-invalid",
      "Source move requires the matching GitHub repository snapshot.",
    );
  }
  const expectedSnapshotLocation = record.source.repository.toLocaleLowerCase();
  const snapshotLocation =
    typeof snapshot.repository.owner === "string" &&
    typeof snapshot.repository.name === "string"
      ? `${snapshot.repository.owner}/${snapshot.repository.name}`.toLocaleLowerCase()
      : null;
  if (
    snapshotLocation !== expectedSnapshotLocation ||
    normalizedGitHubRepositoryUrl(snapshot.repository.url) !==
      expectedSnapshotLocation
  ) {
    fail(
      "owner-request-invalid",
      "Source move snapshot location does not match the current registry source.",
    );
  }

  const updatedRecord = {
    ...record,
    source: {
      ...record.source,
      repository: repository.fullName,
      repository_id: repository.id,
    },
  };
  const updatedSnapshot = {
    ...snapshot,
    repository: {
      ...snapshot.repository,
      owner: repository.owner?.login ?? location.owner,
      name: location.name,
      url: repository.htmlUrl,
    },
  };
  return {
    record: updatedRecord,
    snapshot: updatedSnapshot,
    changedPaths: [registryPath(record), snapshotPath(record)],
    before: structuredClone(manifest.original),
    after: {
      repository: repository.fullName,
      repository_id: repository.id,
    },
  };
}

function applyDelist(input, record, snapshot) {
  const before = {
    visibility: record.visibility,
    visibility_reason: record.visibility_reason,
    refresh_policy: record.refresh_policy,
    enrichment_policy: record.enrichment_policy,
    ...(record.enrichment_note === undefined
      ? {}
      : { enrichment_note: record.enrichment_note }),
  };
  const updated = {
    ...record,
    visibility: "disabled",
    visibility_reason: "removed",
    refresh_policy: "paused",
    enrichment_policy: "manual",
    enrichment_note: `Owner-requested delisting approved through issue #${input.issueNumber}.`,
  };
  return {
    record: updated,
    snapshot,
    changedPaths: [registryPath(record)],
    before,
    after: {
      visibility: updated.visibility,
      visibility_reason: updated.visibility_reason,
      refresh_policy: updated.refresh_policy,
      enrichment_policy: updated.enrichment_policy,
      enrichment_note: updated.enrichment_note,
    },
  };
}

export function applyProjectOwnerRequest(input) {
  requirePositiveInteger(
    input?.issueNumber,
    "Owner request issue number must be a positive integer.",
  );
  const manifest = normalizeManifest(input);
  requireCurrentRecord(manifest, input.record);

  const conflict = detectOwnerRequestConflict({
    manifest,
    record: input.record,
  });
  if (conflict.conflict) {
    fail(
      conflict.reasonCode,
      `${conflict.reasonCode}: current values changed for ${conflict.fields.join(", ")}.`,
    );
  }

  const record = structuredClone(input.record);
  const snapshot =
    input.snapshot === null || input.snapshot === undefined
      ? null
      : structuredClone(input.snapshot);

  if (manifest.operation === "edit-card") {
    return applyCardEdit(input, manifest, record, snapshot);
  }
  if (manifest.operation === "move-source") {
    return applySourceMove(input, manifest, record, snapshot);
  }
  return applyDelist(input, record, snapshot);
}

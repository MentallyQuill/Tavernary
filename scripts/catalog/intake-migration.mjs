const frontendIdByLabel = new Map([
  ["SillyTavern", "sillytavern"],
  ["Lumiverse", "lumiverse"],
  ["Marinara Engine", "marinara-engine"],
  ["Sonder Engine", "sonder-engine"],
]);

const frontendLabelById = new Map(
  [...frontendIdByLabel.entries()].map(([label, id]) => [id, label]),
);

function assertString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function withoutTrailingSlash(url) {
  return url.replace(/\/+$/, "");
}

function normalizeFrontends(frontends) {
  if (!Array.isArray(frontends)) {
    return [];
  }
  return frontends.map((frontend) => {
    const label = assertString(frontend, "frontend");
    const normalized = frontendIdByLabel.get(label);
    if (!normalized) {
      throw new Error(`Unknown frontend label: ${label}`);
    }
    return normalized;
  });
}

function normalizeRepository(repository) {
  if (!repository || typeof repository !== "object") {
    throw new Error("repository is required");
  }
  const owner = assertString(repository.owner, "repository.owner");
  const name = assertString(repository.name, "repository.name");
  return `${owner}/${name}`;
}

function joinLabels(labels) {
  if (labels.length <= 1) {
    return labels[0] ?? "";
  }
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

export function provisionalSummary(_name, kind, frontends) {
  const labels = frontends.map((frontend) => {
    const label = frontendLabelById.get(frontend);
    if (!label) {
      throw new Error(`Unknown normalized frontend id: ${frontend}`);
    }
    return label;
  });
  const frontendSummary = joinLabels(labels);

  if (kind === "extension") {
    return `An extension for ${frontendSummary}.`;
  }
  if (kind === "preset") {
    return `A System Preset for ${frontendSummary}.`;
  }
  return `A frontend for ${frontendSummary}.`;
}

function inferKind(record) {
  if (
    record.kind === "frontend" ||
    record.kind === "extension" ||
    record.kind === "preset"
  ) {
    return record.kind;
  }
  if (Array.isArray(record.tags)) {
    if (record.tags.includes("Presets") || record.tags.includes("Prompts")) {
      return "preset";
    }
  }
  return "extension";
}

function normalizeSource(record) {
  if (record.source_type === "organization") {
    const rawUrl = assertString(record.repository?.url, "repository.url");
    const url = withoutTrailingSlash(rawUrl);
    return {
      source: {
        type: "github-organization",
        organization: assertString(record.repository?.owner, "repository.owner"),
        url,
      },
      normalizedChanged: url !== rawUrl,
    };
  }
  if (typeof record.source_url === "string") {
    const url = withoutTrailingSlash(record.source_url);
    return {
      source: {
        type: "url",
        url,
        published_at: null,
        version: null,
        artifact_size_bytes: null,
        license_status: "pending",
        license_spdx_id: null,
      },
      normalizedChanged: url !== record.source_url,
    };
  }
  return {
    source: {
      type: "github",
      repository: normalizeRepository(record.repository),
      repository_id: null,
    },
    normalizedChanged: false,
  };
}

function canonicalSourceKey(source) {
  if (source.type === "github") {
    return `github:${source.repository.toLowerCase()}`;
  }
  if (source.type === "github-organization") {
    return `github-organization:${source.url.toLowerCase()}`;
  }
  return `url:${source.url}`;
}

function toRecord(record) {
  const kind =
    record.name === "Tavern RPG Suite" && record.source_type === "organization"
      ? "extension"
      : inferKind(record);
  const frontends = normalizeFrontends(record.frontends);
  const { source, normalizedChanged } = normalizeSource(record);
  return {
    record: {
      schema_version: 2,
      id: assertString(record.id, "id"),
      name: assertString(record.name, "name"),
      kind,
      summary: provisionalSummary(record.name, kind, frontends),
      metadata_status: "provisional",
      source,
      frontends,
      primary_function: "uncategorized",
      capabilities: [],
      cataloged_at: `${assertString(record.submitted_at, "submitted_at")}T00:00:00Z`,
      catalog_cohort: "seed",
      visibility: "published",
      refresh_policy:
        record.source_url || record.source_type === "organization"
          ? "paused"
          : "automatic",
    },
    normalizedChanged,
  };
}

function countBy(expectedRecords, key) {
  const counts = {};
  for (const record of expectedRecords) {
    const value =
      key === "kind"
        ? record.kind
        : key === "source.type"
          ? record.source.type
          : null;
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

export function migrateIntake(input) {
  const intake = input?.intake ?? [];
  const existingRecords = input?.existingRecords ?? [];
  const existingById = new Map(existingRecords.map((record) => [record.id, record]));
  const intakeIds = new Set();
  const intakeSources = new Set();
  const expectedRecords = [];
  const recordsToWrite = [];
  let curatedOverlaps = 0;
  let provisionalMatches = 0;
  let normalizedSourceChanges = 0;

  for (const entry of intake) {
    const migrated = toRecord(entry);
    const record = migrated.record;

    if (intakeIds.has(record.id)) {
      throw new Error(`Duplicate intake id: ${record.id}`);
    }
    intakeIds.add(record.id);

    const canonicalSource = canonicalSourceKey(record.source);
    if (intakeSources.has(canonicalSource)) {
      throw new Error(`Duplicate intake canonical source: ${canonicalSource}`);
    }
    intakeSources.add(canonicalSource);
    normalizedSourceChanges += migrated.normalizedChanged ? 1 : 0;

    const existing = existingById.get(record.id);
    if (existing?.metadata_status === "curated") {
      curatedOverlaps += 1;
      continue;
    }

    expectedRecords.push(record);
    if (!existing) {
      recordsToWrite.push(record);
      continue;
    }

    if (JSON.stringify(existing) === JSON.stringify(record)) {
      provisionalMatches += 1;
      continue;
    }

    throw new Error(`Provisional drift: ${record.id}`);
  }

  const byKind = {
    frontend: 0,
    extension: 0,
    preset: 0,
    ...countBy(expectedRecords, "kind"),
  };
  const bySource = {
    github: 0,
    "github-organization": 0,
    url: 0,
    ...countBy(expectedRecords, "source.type"),
  };

  return {
    expectedRecords,
    recordsToWrite,
    report: {
      intake_records: intake.length,
      curated_overlaps: curatedOverlaps,
      generated_records: expectedRecords.length,
      writes_required: recordsToWrite.length,
      provisional_matches: provisionalMatches,
      provisional_drift: [],
      final_union_records: existingRecords.length + recordsToWrite.length,
      by_kind: byKind,
      by_source: bySource,
      provisional_summaries: expectedRecords.length,
      uncategorized_records: expectedRecords.length,
      null_repository_ids: expectedRecords.filter(
        (record) =>
          record.source.type === "github" && record.source.repository_id === null,
      ).length,
      normalized_source_changes: normalizedSourceChanges,
    },
  };
}

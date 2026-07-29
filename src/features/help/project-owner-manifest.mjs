const ENVELOPE_KEYS = [
  "schema_version",
  "request_kind",
  "operation",
  "project_id",
  "repository_id",
  "source_fingerprint",
  "original",
  "proposed",
  "explanation",
];
const EDITABLE_KEYS = [
  "name",
  "summary",
  "frontends",
  "primary_function",
  "capabilities",
  "model_families",
  "completion_formats",
];
const ORIGINAL_EDIT_KEYS = ["kind", ...EDITABLE_KEYS];
const SOURCE_KEYS = ["repository", "repository_id"];
const DELIST_ORIGINAL_KEYS = ["visibility"];
const DELIST_PROPOSED_KEYS = [
  "visibility",
  "visibility_reason",
  "refresh_policy",
  "enrichment_policy",
];
const PROJECT_KINDS = ["frontend", "extension", "preset"];
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value, allowed) {
  return (
    isObject(value) && Object.keys(value).every((key) => allowed.includes(key))
  );
}

function requiredText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value, errors) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    errors.push("Owner request explanation must be a string or null.");
    return null;
  }
  return value.trim() || null;
}

function vocabularyEntries(value, key) {
  const entries = Array.isArray(value) ? value : value?.[key];
  if (!Array.isArray(entries)) return new Set();
  return new Set(
    entries.flatMap((entry) =>
      typeof entry === "string"
        ? [entry]
        : typeof entry?.id === "string"
          ? [entry.id]
          : [],
    ),
  );
}

function controlledArray(value, allowed, errors, message) {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    errors.push(message);
    return [];
  }
  const normalized = [
    ...new Set(value.map((entry) => entry.trim()).filter(Boolean)),
  ];
  if (normalized.some((entry) => !allowed.has(entry))) errors.push(message);
  return normalized;
}

function normalizedSummary(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : "";
}

function normalizeEditable(value, kind, vocabularies, errors, original) {
  const allowedKeys = original ? ORIGINAL_EDIT_KEYS : EDITABLE_KEYS;
  if (!hasOnlyKeys(value, allowedKeys)) {
    errors.push("Owner card values contain unknown properties.");
  }
  const name = requiredText(value?.name);
  const summary = normalizedSummary(value?.summary);
  const primaryFunction = requiredText(value?.primary_function);
  const frontends = controlledArray(
    value?.frontends,
    vocabularies.frontends,
    errors,
    "Owner supported frontends are invalid.",
  );
  const capabilities = controlledArray(
    value?.capabilities,
    vocabularies.capabilities,
    errors,
    "Owner capabilities are invalid.",
  );
  const modelFamilies = controlledArray(
    value?.model_families,
    vocabularies.modelFamilies,
    errors,
    "Owner model families are invalid.",
  );
  const completionFormats = controlledArray(
    value?.completion_formats,
    vocabularies.completionFormats,
    errors,
    "Owner completion formats are invalid.",
  );

  if (!name) errors.push("Owner display name is required.");
  if (name.length > 100) {
    errors.push("Owner display name must be 100 characters or fewer.");
  }
  if (/[\u0000-\u001f\u007f]/u.test(name)) {
    errors.push("Owner display name must be single-line plain text.");
  }
  if (!summary) errors.push("Owner summary is required.");
  if (summary.length > 220) {
    errors.push("Owner summary must be 220 characters or fewer.");
  }
  if (!vocabularies.primaryFunctions.has(primaryFunction)) {
    errors.push("Owner primary function is invalid.");
  }
  const primaryFunctionError = classificationError(kind, primaryFunction);
  if (primaryFunctionError) errors.push(primaryFunctionError);
  if (kind === "preset") {
    if (modelFamilies.length === 0) {
      errors.push("Owner Preset must include at least one model family.");
    }
    if (completionFormats.length === 0) {
      errors.push("Owner Preset must include at least one completion format.");
    }
  } else if (modelFamilies.length > 0 || completionFormats.length > 0) {
    errors.push("Only Presets can change model compatibility.");
  }

  return {
    ...(original ? { kind } : {}),
    name,
    summary,
    frontends,
    primary_function: primaryFunction,
    capabilities,
    model_families: modelFamilies,
    completion_formats: completionFormats,
  };
}

function comparableEditable(value) {
  return {
    ...value,
    frontends: [...value.frontends].sort(),
    capabilities: [...value.capabilities].sort(),
    model_families: [...value.model_families].sort(),
    completion_formats: [...value.completion_formats].sort(),
  };
}

function normalizeEdit(value, vocabularies, errors) {
  const kind = requiredText(value?.original?.kind);
  if (!PROJECT_KINDS.includes(kind))
    errors.push("Owner project kind is invalid.");
  const original = normalizeEditable(
    value?.original,
    kind,
    vocabularies,
    errors,
    true,
  );
  const proposed = normalizeEditable(
    value?.proposed,
    kind,
    vocabularies,
    errors,
    false,
  );
  const { kind: _kind, ...originalEditable } = original;
  if (
    JSON.stringify(comparableEditable(originalEditable)) ===
    JSON.stringify(comparableEditable(proposed))
  ) {
    errors.push("Owner card edit must change at least one field.");
  }
  return { original, proposed };
}

function normalizeSource(value, errors, label) {
  if (!hasOnlyKeys(value, SOURCE_KEYS)) {
    errors.push(`Owner ${label} source contains unknown properties.`);
  }
  const repository = requiredText(value?.repository);
  const repositoryId = value?.repository_id;
  if (!REPOSITORY_PATTERN.test(repository)) {
    errors.push(`Owner ${label} repository is invalid.`);
  }
  if (!Number.isSafeInteger(repositoryId) || repositoryId <= 0) {
    errors.push(`Owner ${label} repository ID must be a positive integer.`);
  }
  return { repository, repository_id: repositoryId };
}

function normalizeMove(value, envelopeRepositoryId, errors) {
  const original = normalizeSource(value?.original, errors, "original");
  const proposed = normalizeSource(value?.proposed, errors, "proposed");
  if (
    original.repository_id !== envelopeRepositoryId ||
    proposed.repository_id !== envelopeRepositoryId
  ) {
    errors.push(
      "Repository location changes must retain the immutable repository ID.",
    );
  }
  if (original.repository === proposed.repository) {
    errors.push("Repository location change must name a new repository.");
  }
  return { original, proposed };
}

function normalizeDelist(value, errors) {
  if (!hasOnlyKeys(value?.original, DELIST_ORIGINAL_KEYS)) {
    errors.push("Owner original delisting values contain unknown properties.");
  }
  if (!hasOnlyKeys(value?.proposed, DELIST_PROPOSED_KEYS)) {
    errors.push("Owner proposed delisting values contain unknown properties.");
  }
  const original = { visibility: requiredText(value?.original?.visibility) };
  if (original.visibility !== "published") {
    errors.push("Owner request can delist only a published project.");
  }
  const proposed = {
    visibility: value?.proposed?.visibility,
    visibility_reason: value?.proposed?.visibility_reason,
    refresh_policy: value?.proposed?.refresh_policy,
    enrichment_policy: value?.proposed?.enrichment_policy,
  };
  if (
    proposed.visibility !== "disabled" ||
    proposed.visibility_reason !== "removed" ||
    proposed.refresh_policy !== "paused" ||
    proposed.enrichment_policy !== "manual"
  ) {
    errors.push("Owner delisting effect is invalid.");
  }
  return { original, proposed };
}

export function normalizeProjectOwnerManifest(value, rawVocabularies) {
  const errors = [];
  if (value?.schema_version !== 1) {
    errors.push("Owner request must use schema version 1.");
  }
  if (value?.request_kind !== "project-owner") {
    errors.push("Owner request kind is invalid.");
  }
  const operation = requiredText(value?.operation);
  if (!["edit-card", "move-source", "delist"].includes(operation)) {
    errors.push("Owner request operation is invalid.");
  }
  const envelopeKeys =
    operation === "delist"
      ? [...ENVELOPE_KEYS, "delist_confirmation"]
      : ENVELOPE_KEYS;
  if (!hasOnlyKeys(value, envelopeKeys)) {
    errors.push("Owner request contains unknown properties.");
  }
  const projectId = requiredText(value?.project_id);
  if (!projectId || projectId.length > 120) {
    errors.push("Owner request project ID is invalid.");
  }
  const repositoryId = value?.repository_id;
  if (
    !Object.hasOwn(value ?? {}, "repository_id") ||
    (repositoryId !== null &&
      (!Number.isSafeInteger(repositoryId) || repositoryId <= 0))
  ) {
    errors.push(
      "Owner request repository ID must be a positive integer or null.",
    );
  }
  if (
    operation === "move-source" &&
    (!Number.isSafeInteger(repositoryId) || repositoryId <= 0)
  ) {
    errors.push("Owner source move requires a positive repository ID.");
  }
  const sourceFingerprint = requiredText(value?.source_fingerprint);
  if (!/^[a-f0-9]{64}$/u.test(sourceFingerprint)) {
    errors.push("Owner request source fingerprint is invalid.");
  }
  if (!Object.hasOwn(value ?? {}, "explanation")) {
    errors.push("Owner request explanation member is required.");
  }
  const explanation = nullableText(value?.explanation, errors);
  const delistConfirmation =
    operation === "delist" ? requiredText(value?.delist_confirmation) : null;
  if (operation === "delist" && !delistConfirmation) {
    errors.push("Owner delisting confirmation is required.");
  }
  const explanationLimit = operation === "delist" ? 500 : 1_000;
  if (explanation && explanation.length > explanationLimit) {
    errors.push(
      `Owner request explanation must be ${explanationLimit.toLocaleString("en-US")} characters or fewer.`,
    );
  }

  const vocabularies = {
    frontends: vocabularyEntries(rawVocabularies?.frontends, "frontends"),
    primaryFunctions: vocabularyEntries(
      rawVocabularies?.primaryFunctions,
      "primary_functions",
    ),
    capabilities: vocabularyEntries(
      rawVocabularies?.capabilities,
      "capabilities",
    ),
    modelFamilies: vocabularyEntries(
      rawVocabularies?.modelFamilies,
      "model_families",
    ),
    completionFormats: vocabularyEntries(
      rawVocabularies?.completionFormats,
      "completion_formats",
    ),
  };

  let values = { original: {}, proposed: {} };
  if (operation === "edit-card") {
    values = normalizeEdit(value, vocabularies, errors);
  } else if (operation === "move-source") {
    values = normalizeMove(value, repositoryId, errors);
  } else if (operation === "delist") {
    values = normalizeDelist(value, errors);
  }

  if (errors.length > 0) {
    return { valid: false, errors: [...new Set(errors)] };
  }
  return {
    valid: true,
    manifest: {
      schema_version: 1,
      request_kind: "project-owner",
      operation,
      project_id: projectId,
      repository_id: repositoryId,
      source_fingerprint: sourceFingerprint,
      ...values,
      explanation,
      ...(operation === "delist"
        ? { delist_confirmation: delistConfirmation }
        : {}),
    },
  };
}
import { classificationError } from "../catalog/primary-function-contract.mjs";

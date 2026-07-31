import { classificationError } from "../catalog/primary-function-contract.mjs";
import { siblingProjectId } from "../catalog/source-record.mjs";

const PROJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SOURCE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/u;
const DRAFT_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/u;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const PROJECT_KINDS = ["frontend", "extension", "preset"];
const OPERATIONS = [
  "edit-card",
  "add-cards",
  "retire-card",
  "restore-card",
  "move-source",
  "delist-source",
];
const BASE_KEYS = [
  "schema_version",
  "request_kind",
  "operation",
  "source_id",
  "repository_id",
  "explanation",
];
export const STALE_TAG_VOCABULARY_ERROR =
  "Owner request tag vocabulary is stale. Rebuild and resubmit the request.";
const OPERATION_KEYS = {
  "edit-card": [
    ...BASE_KEYS,
    "tag_vocabulary_hash",
    "project_id",
    "project_fingerprint",
    "original",
    "proposed",
  ],
  "add-cards": [
    ...BASE_KEYS,
    "tag_vocabulary_hash",
    "source_fingerprint",
    "proposed_cards",
  ],
  "retire-card": [
    ...BASE_KEYS,
    "project_id",
    "project_fingerprint",
    "original",
    "proposed",
  ],
  "restore-card": [
    ...BASE_KEYS,
    "project_id",
    "project_fingerprint",
    "original",
    "proposed",
  ],
  "move-source": [...BASE_KEYS, "source_fingerprint", "original", "proposed"],
  "delist-source": [
    ...BASE_KEYS,
    "source_fingerprint",
    "original",
    "proposed",
    "delist_confirmation",
  ],
};
const EDITABLE_KEYS = [
  "name",
  "summary",
  "frontends",
  "primary_function",
  "tags",
  "metadata",
  "model_families",
  "completion_formats",
];
const ORIGINAL_EDIT_KEYS = ["kind", ...EDITABLE_KEYS];
const DRAFT_KEYS = [
  "draft_id",
  "project_id",
  "name",
  "kind",
  "summary",
  "frontends",
  "primary_function",
  "tags",
  "metadata",
  "model_families",
  "completion_formats",
];
const SOURCE_KEYS = ["repository", "repository_id"];
const CARD_STATE_KEYS = ["listing_status", "listing_status_reason"];
const SOURCE_STATE_ORIGINAL_KEYS = ["status"];
const SOURCE_STATE_PROPOSED_KEYS = [
  "status",
  "status_reason",
  "refresh_policy",
];

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, allowed) {
  return (
    isObject(value) &&
    Object.keys(value).length === allowed.length &&
    Object.keys(value).every((key) => allowed.includes(key))
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
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry) =>
    typeof entry === "string"
      ? [{ id: entry, applicable_kinds: PROJECT_KINDS }]
      : typeof entry?.id === "string"
        ? [
            {
              id: entry.id,
              applicable_kinds: Array.isArray(entry.applicable_kinds)
                ? entry.applicable_kinds
                : PROJECT_KINDS,
            },
          ]
        : [],
  );
}

function controlledArray(value, allowed, errors, message, maximum = null) {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    errors.push(message);
    return [];
  }
  const normalized = value.map((entry) => entry.trim()).filter(Boolean);
  if (
    new Set(normalized).size !== normalized.length ||
    normalized.some((entry) => !allowed.has(entry)) ||
    (maximum !== null && normalized.length > maximum)
  ) {
    errors.push(message);
  }
  return [...new Set(normalized)];
}

function normalizedSummary(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : "";
}

function normalizeMetadata(value, errors) {
  if (!hasExactKeys(value, ["summary", "tags"])) {
    errors.push("Owner metadata choices are invalid.");
  }
  const normalizeField = (field) => {
    const candidate = value?.[field];
    if (
      !hasExactKeys(candidate, ["mode"]) ||
      !["automatic", "manual"].includes(candidate?.mode)
    ) {
      errors.push(`Owner ${field} metadata choice is invalid.`);
    }
    return {
      mode: ["automatic", "manual"].includes(candidate?.mode)
        ? candidate.mode
        : "automatic",
    };
  };
  return {
    summary: normalizeField("summary"),
    tags: normalizeField("tags"),
  };
}

function tagVocabulary(rawVocabularies) {
  const entries = vocabularyEntries(rawVocabularies?.tags, "tags");
  return {
    ids: new Set(entries.map((entry) => entry.id)),
    applicableKindsById: new Map(
      entries.map((entry) => [entry.id, new Set(entry.applicable_kinds)]),
    ),
  };
}

function normalizeEditable(
  value,
  kind,
  vocabularies,
  errors,
  { original = false, draft = false } = {},
) {
  const allowedKeys = draft
    ? DRAFT_KEYS
    : original
      ? ORIGINAL_EDIT_KEYS
      : EDITABLE_KEYS;
  if (!hasExactKeys(value, allowedKeys)) {
    errors.push("Owner card values contain unknown or missing properties.");
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
  const tags = controlledArray(
    value?.tags,
    vocabularies.tags.ids,
    errors,
    "Owner tags are invalid or exceed six.",
    6,
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
  const metadata = normalizeMetadata(value?.metadata, errors);

  if (!PROJECT_KINDS.includes(kind))
    errors.push("Owner project kind is invalid.");
  if (!name) errors.push("Owner display name is required.");
  if (name.length > 100) {
    errors.push("Owner display name must be 100 characters or fewer.");
  }
  if (/[\u0000-\u001f\u007f]/u.test(name)) {
    errors.push("Owner display name must be single-line plain text.");
  }
  if (!summary && (original || metadata.summary.mode === "manual")) {
    errors.push("Owner summary is required.");
  }
  if (summary.length > 220) {
    errors.push("Owner summary must be 220 characters or fewer.");
  }
  if (!vocabularies.primaryFunctions.has(primaryFunction)) {
    errors.push("Owner primary function is invalid.");
  }
  const primaryFunctionError = classificationError(kind, primaryFunction);
  if (primaryFunctionError) errors.push(primaryFunctionError);
  for (const tag of tags) {
    if (!vocabularies.tags.applicableKindsById.get(tag)?.has(kind)) {
      errors.push(`Owner tag ${tag} does not apply to ${kind} cards.`);
    }
  }
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
    ...(draft
      ? {
          draft_id: requiredText(value?.draft_id),
          project_id: requiredText(value?.project_id),
          kind,
        }
      : original
        ? { kind }
        : {}),
    name,
    summary,
    frontends,
    primary_function: primaryFunction,
    tags,
    metadata,
    model_families: modelFamilies,
    completion_formats: completionFormats,
  };
}

function comparableEditable(value) {
  return {
    ...value,
    frontends: [...value.frontends].sort(),
    tags: [...value.tags].sort(),
    model_families: [...value.model_families].sort(),
    completion_formats: [...value.completion_formats].sort(),
  };
}

function normalizeEdit(value, vocabularies, errors) {
  const kind = requiredText(value?.original?.kind);
  const original = normalizeEditable(
    value?.original,
    kind,
    vocabularies,
    errors,
    {
      original: true,
    },
  );
  const proposed = normalizeEditable(
    value?.proposed,
    kind,
    vocabularies,
    errors,
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

function normalizeDraft(value, source, vocabularies, errors, index) {
  const kind = requiredText(value?.kind);
  const draft = normalizeEditable(value, kind, vocabularies, errors, {
    draft: true,
  });
  if (!DRAFT_ID_PATTERN.test(draft.draft_id)) {
    errors.push(`Owner card draft ${index + 1} has an invalid draft ID.`);
  }
  if (!PROJECT_ID_PATTERN.test(draft.project_id)) {
    errors.push(`Owner card draft ${index + 1} has an invalid project ID.`);
  }
  if (
    source &&
    draft.name &&
    draft.project_id !== siblingProjectId(source, draft.name)
  ) {
    errors.push(
      `Owner card draft ${index + 1} project ID does not match its source and title.`,
    );
  }
  return draft;
}

function normalizeAddCards(value, source, vocabularies, errors) {
  if (
    !Array.isArray(value?.proposed_cards) ||
    value.proposed_cards.length < 1 ||
    value.proposed_cards.length > 10
  ) {
    errors.push("Owner add-card request must contain one to ten cards.");
  }
  const cards = Array.isArray(value?.proposed_cards)
    ? value.proposed_cards
        .slice(0, 10)
        .map((card, index) =>
          normalizeDraft(card, source, vocabularies, errors, index),
        )
    : [];
  for (const [field, values] of [
    ["draft IDs", cards.map((card) => card.draft_id)],
    ["project IDs", cards.map((card) => card.project_id)],
    [
      "normalized titles",
      cards.map((card) => card.name.toLocaleLowerCase().replace(/\s+/gu, " ")),
    ],
  ]) {
    if (new Set(values).size !== values.length) {
      errors.push(`Owner add-card request contains duplicate ${field}.`);
    }
  }
  return { proposed_cards: cards };
}

function normalizeSource(value, errors, label) {
  if (!hasExactKeys(value, SOURCE_KEYS)) {
    errors.push(
      `Owner ${label} source contains unknown or missing properties.`,
    );
  }
  const repository = requiredText(value?.repository);
  const repositoryId = value?.repository_id;
  if (!REPOSITORY_PATTERN.test(repository)) {
    errors.push(`Owner ${label} repository is invalid.`);
  }
  if (
    repositoryId !== null &&
    (!Number.isSafeInteger(repositoryId) || repositoryId <= 0)
  ) {
    errors.push(
      `Owner ${label} repository ID must be a positive integer or null for non-GitHub sources.`,
    );
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
  if (
    original.repository.toLocaleLowerCase() ===
    proposed.repository.toLocaleLowerCase()
  ) {
    errors.push("Repository location change must name a new repository.");
  }
  return { original, proposed };
}

function normalizeCardState(value, operation, errors) {
  if (
    !hasExactKeys(value?.original, CARD_STATE_KEYS) ||
    !hasExactKeys(value?.proposed, CARD_STATE_KEYS)
  ) {
    errors.push("Owner card lifecycle values are invalid.");
  }
  const expected =
    operation === "retire-card"
      ? {
          original: { listing_status: "active", listing_status_reason: null },
          proposed: {
            listing_status: "retired",
            listing_status_reason: "owner-request",
          },
        }
      : {
          original: {
            listing_status: "retired",
            listing_status_reason: "owner-request",
          },
          proposed: { listing_status: "active", listing_status_reason: null },
        };
  if (
    JSON.stringify(value?.original) !== JSON.stringify(expected.original) ||
    JSON.stringify(value?.proposed) !== JSON.stringify(expected.proposed)
  ) {
    errors.push(`Owner ${operation} lifecycle transition is invalid.`);
  }
  return expected;
}

function normalizeDelistSource(value, source, errors) {
  if (
    !hasExactKeys(value?.original, SOURCE_STATE_ORIGINAL_KEYS) ||
    !hasExactKeys(value?.proposed, SOURCE_STATE_PROPOSED_KEYS) ||
    value?.original?.status !== "active" ||
    value?.proposed?.status !== "delisted" ||
    value?.proposed?.status_reason !== "removed" ||
    value?.proposed?.refresh_policy !== "paused"
  ) {
    errors.push("Owner source delisting effect is invalid.");
  }
  const confirmation = requiredText(value?.delist_confirmation);
  if (!confirmation) {
    errors.push("Owner source delisting confirmation is required.");
  } else if (
    source?.repository &&
    confirmation.toLocaleLowerCase() !== source.repository.toLocaleLowerCase()
  ) {
    errors.push(
      "Owner source delisting confirmation must match the repository.",
    );
  }
  return {
    original: { status: "active" },
    proposed: {
      status: "delisted",
      status_reason: "removed",
      refresh_policy: "paused",
    },
    delist_confirmation: confirmation,
  };
}

function sourceContext(rawVocabularies, sourceId, repositoryId, errors) {
  const source = rawVocabularies?.source;
  if (source === undefined) return null;
  const isGitHub = source?.type === "github";
  const validGitHubIdentity =
    isGitHub &&
    Number.isSafeInteger(repositoryId) &&
    repositoryId > 0 &&
    source.repository_id === repositoryId &&
    REPOSITORY_PATTERN.test(source.repository ?? "");
  const validNonGitHubIdentity =
    isObject(source) && !isGitHub && repositoryId === null;
  if (
    !isObject(source) ||
    source.id !== sourceId ||
    (!validGitHubIdentity && !validNonGitHubIdentity)
  ) {
    errors.push("Owner request source context is inconsistent.");
    return null;
  }
  return source;
}

export function normalizeProjectOwnerManifest(value, rawVocabularies) {
  const errors = [];
  if (value?.schema_version !== 2) {
    errors.push("Owner request must use schema version 2.");
  }
  if (value?.request_kind !== "project-owner") {
    errors.push("Owner request kind is invalid.");
  }
  const operation = requiredText(value?.operation);
  if (!OPERATIONS.includes(operation)) {
    errors.push("Owner request operation is invalid.");
  }
  const envelopeKeys = OPERATION_KEYS[operation] ?? BASE_KEYS;
  if (!hasExactKeys(value, envelopeKeys)) {
    errors.push("Owner request contains unknown or missing properties.");
  }
  const sourceId = requiredText(value?.source_id);
  if (!SOURCE_ID_PATTERN.test(sourceId)) {
    errors.push("Owner request source ID is invalid.");
  }
  const repositoryId = value?.repository_id;
  if (
    repositoryId !== null &&
    (!Number.isSafeInteger(repositoryId) || repositoryId <= 0)
  ) {
    errors.push(
      "Owner request repository ID must be a positive integer or null for non-GitHub sources.",
    );
  }
  const usesProject = ["edit-card", "retire-card", "restore-card"].includes(
    operation,
  );
  const projectId = usesProject ? requiredText(value?.project_id) : null;
  if (usesProject && !PROJECT_ID_PATTERN.test(projectId)) {
    errors.push("Owner request project ID is invalid.");
  }
  const fingerprintField = usesProject
    ? "project_fingerprint"
    : "source_fingerprint";
  const fingerprint = requiredText(value?.[fingerprintField]);
  if (!FINGERPRINT_PATTERN.test(fingerprint)) {
    errors.push(
      `Owner request ${fingerprintField.replace("_", " ")} is invalid.`,
    );
  }
  if (!Object.hasOwn(value ?? {}, "explanation")) {
    errors.push("Owner request explanation member is required.");
  }
  const explanation = nullableText(value?.explanation, errors);
  const explanationLimit = operation === "delist-source" ? 500 : 1_000;
  if (explanation && explanation.length > explanationLimit) {
    errors.push(
      `Owner request explanation must be ${explanationLimit.toLocaleString("en-US")} characters or fewer.`,
    );
  }
  const usesTags = operation === "edit-card" || operation === "add-cards";
  const tagVocabularyHash = usesTags
    ? requiredText(value?.tag_vocabulary_hash)
    : null;
  if (
    usesTags &&
    (!FINGERPRINT_PATTERN.test(tagVocabularyHash) ||
      !FINGERPRINT_PATTERN.test(rawVocabularies?.tagVocabularyHash ?? "") ||
      tagVocabularyHash !== rawVocabularies.tagVocabularyHash)
  ) {
    errors.push(STALE_TAG_VOCABULARY_ERROR);
  }

  const tagIndex = tagVocabulary(rawVocabularies);
  const vocabularies = {
    frontends: new Set(
      vocabularyEntries(rawVocabularies?.frontends, "frontends").map(
        (entry) => entry.id,
      ),
    ),
    primaryFunctions: new Set(
      vocabularyEntries(
        rawVocabularies?.primaryFunctions,
        "primary_functions",
      ).map((entry) => entry.id),
    ),
    tags: tagIndex,
    modelFamilies: new Set(
      vocabularyEntries(rawVocabularies?.modelFamilies, "model_families").map(
        (entry) => entry.id,
      ),
    ),
    completionFormats: new Set(
      vocabularyEntries(
        rawVocabularies?.completionFormats,
        "completion_formats",
      ).map((entry) => entry.id),
    ),
  };
  const source = sourceContext(rawVocabularies, sourceId, repositoryId, errors);

  let operationValues = {};
  if (operation === "edit-card") {
    operationValues = normalizeEdit(value, vocabularies, errors);
  } else if (operation === "add-cards") {
    operationValues = normalizeAddCards(value, source, vocabularies, errors);
  } else if (operation === "retire-card" || operation === "restore-card") {
    operationValues = normalizeCardState(value, operation, errors);
  } else if (operation === "move-source") {
    operationValues = normalizeMove(value, repositoryId, errors);
  } else if (operation === "delist-source") {
    operationValues = normalizeDelistSource(value, source, errors);
  }

  if (errors.length > 0) {
    return { valid: false, errors: [...new Set(errors)] };
  }
  return {
    valid: true,
    manifest: {
      schema_version: 2,
      request_kind: "project-owner",
      operation,
      source_id: sourceId,
      repository_id: repositoryId,
      ...(usesTags ? { tag_vocabulary_hash: tagVocabularyHash } : {}),
      ...(usesProject
        ? {
            project_id: projectId,
            project_fingerprint: fingerprint,
          }
        : { source_fingerprint: fingerprint }),
      ...operationValues,
      explanation,
    },
  };
}

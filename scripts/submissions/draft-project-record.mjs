import { defaultEnrichmentFields } from "../catalog/enrichment-policy.mjs";
import { resolveRequestedMetadata } from "../catalog/metadata-policy.mjs";
import { validateCatalogCopyMetadata } from "../catalog/catalog-copy-contract.mjs";
import { EXTENSION_PRIMARY_FUNCTION_IDS } from "../../src/features/catalog/primary-function-contract.mjs";
import { proposeFrontendVocabularyEntry } from "./frontend-reconciliation.mjs";
import {
  isRepositoryIdentity,
  sourceIdentityName,
} from "./source-identity.mjs";
import { repositorySourceId } from "../../src/features/catalog/source-record.mjs";

const extensionPrimaryFunctions = new Set(EXTENSION_PRIMARY_FUNCTION_IDS);

function slug(value) {
  return value
    .normalize("NFKD")
    .replace(/\p{Mark}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function projectId(identity) {
  if (isRepositoryIdentity(identity)) {
    return `${slug(identity.owner)}-${slug(identity.name)}`;
  }
  if (identity.kind === "reddit") return `reddit-${slug(identity.postId)}`;
  const source = new URL(identity.canonicalUrl);
  return slug(`${source.hostname}-${source.pathname}`);
}

function sourceRecord(identity, observation, id) {
  if (isRepositoryIdentity(identity)) {
    return {
      schema_version: 1,
      id: repositorySourceId(identity.provider, observation.repository.id),
      type: identity.provider,
      repository: identity.repository,
      repository_id: observation.repository.id,
      status: "active",
      status_reason: null,
      refresh_policy: "automatic",
    };
  }
  return {
    schema_version: 1,
    id: `url-${id}`,
    type: "url",
    url: identity.canonicalUrl,
    published_at: null,
    version: null,
    artifact_size_bytes: null,
    license_status: "pending",
    license_spdx_id: null,
    status: "active",
    status_reason: null,
    refresh_policy: "paused",
  };
}

function boundedSummary(value) {
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (normalized.length <= 220) return normalized;
  const candidate = normalized.slice(0, 220);
  const boundary = candidate.lastIndexOf(" ");
  return (boundary >= 180 ? candidate.slice(0, boundary) : candidate).trimEnd();
}

function metadataRequest(input) {
  return resolveRequestedMetadata({
    request: input.metadataRequest ?? {
      summary: { mode: "automatic" },
      tags: { mode: "automatic" },
    },
    authority: input.metadataAuthority ?? {
      authorityType: "community-submitter",
      actorId: null,
      actorLogin: null,
    },
  });
}

function fallbackSummary(input, request) {
  return boundedSummary(
    (request.summary.mode === "manual" ? request.summary.value : "") ||
      input.observation?.repository?.description?.trim() ||
      "No README file found.",
  );
}

function enrichmentWarning(input) {
  return input.enrichment?.message
    ? `Automated enrichment failed: ${input.enrichment.message}`
    : "Automated enrichment was unavailable; deterministic provisional metadata was used.";
}

function copyResult(enrichment) {
  if (enrichment?.status !== "curated") return null;
  const result = {
    result: enrichment.result,
    change_reasons: enrichment.change_reasons,
    policy_signal: enrichment.policy_signal,
  };
  return validateCatalogCopyMetadata(result).valid
    ? {
        result: result.result,
        change_reasons: [...result.change_reasons],
        policy_signal: result.policy_signal,
      }
    : null;
}

function acceptedCopyResult(input) {
  if (input.copyResult !== undefined) {
    const validation = validateCatalogCopyMetadata(input.copyResult);
    if (!validation.valid) return null;
    return {
      result: input.copyResult.result,
      change_reasons: [...input.copyResult.change_reasons],
      policy_signal: input.copyResult.policy_signal,
    };
  }
  return copyResult(input.enrichment);
}

function metadataFields(source, request) {
  const defaults = defaultEnrichmentFields(source).metadata_policy;
  return {
    metadata_policy: {
      summary:
        request.summary.mode === "manual"
          ? { mode: "manual", note: request.summary.note }
          : defaults.summary,
      tags:
        request.tags.mode === "manual"
          ? { mode: "manual", note: request.tags.note }
          : defaults.tags,
    },
  };
}

function unavailableClassificationReview(submittedPrimaryFunction) {
  return {
    review: {
      status: "classification-check-unavailable",
      submitted_primary_function: submittedPrimaryFunction,
      suggested_primary_function: null,
      explanation: "The optional classification check was unavailable.",
    },
    warning:
      "The optional classification check was unavailable; the submitted primary function was preserved.",
  };
}

function sanitizedClassificationReview(input, request) {
  if (input.admitted.manifest.project_type !== "extension") {
    return { review: null, warning: null };
  }
  if (
    !input.enrichment &&
    request.summary.mode === "manual" &&
    request.tags.mode === "manual"
  ) {
    return { review: null, warning: null };
  }
  const submittedPrimaryFunction = input.admitted.manifest.primary_function;
  const review =
    input.enrichment?.status === "curated"
      ? input.enrichment.classification_review
      : null;
  if (
    review?.status === "confirmed" &&
    review.suggested_primary_function === submittedPrimaryFunction &&
    review.explanation === null
  ) {
    return {
      review: {
        status: "confirmed",
        submitted_primary_function: submittedPrimaryFunction,
        suggested_primary_function: submittedPrimaryFunction,
        explanation: null,
      },
      warning: null,
    };
  }
  const explanation =
    typeof review?.explanation === "string"
      ? review.explanation
          .replace(/[\u0000-\u001f\u007f<>]+/gu, " ")
          .trim()
          .replace(/\s+/gu, " ")
          .slice(0, 240)
          .trimEnd()
      : "";
  if (
    review?.status === "possible-mismatch" &&
    extensionPrimaryFunctions.has(review.suggested_primary_function) &&
    review.suggested_primary_function !== submittedPrimaryFunction &&
    explanation.length > 0
  ) {
    return {
      review: {
        status: "possible-mismatch",
        submitted_primary_function: submittedPrimaryFunction,
        suggested_primary_function: review.suggested_primary_function,
        explanation,
      },
      warning: null,
    };
  }
  return unavailableClassificationReview(submittedPrimaryFunction);
}

export async function draftProjectRecord(input) {
  const { admitted, observation, snapshot, now } = input;
  const identity = admitted.identity;
  const id = projectId(identity);
  if (isRepositoryIdentity(identity)) {
    if (
      !observation ||
      !Number.isInteger(identity.repositoryId) ||
      identity.repositoryId !== observation.repository.id
    ) {
      throw new Error(
        "Repository observation does not match the permanent repository identity.",
      );
    }
  }
  const source = sourceRecord(identity, observation, id);
  if (
    snapshot &&
    (snapshot.source_id !== source.id ||
      snapshot.repository.id !== observation.repository.id)
  ) {
    throw new Error(
      "Repository snapshot does not match the permanent repository identity.",
    );
  }
  const name = observation?.repository?.name || sourceIdentityName(identity);
  const primaryFunction = admitted.manifest.primary_function;
  const request = metadataRequest(input);
  const curated =
    input.enrichment?.status === "curated" ? input.enrichment : null;
  const summary =
    request.summary.mode === "manual"
      ? (input.publishedSummary ?? request.summary.value)
      : typeof curated?.summary === "string"
        ? curated.summary
        : fallbackSummary(input, request);
  const tags =
    request.tags.mode === "manual"
      ? [...request.tags.values]
      : Array.isArray(curated?.tags)
        ? [...curated.tags]
        : [];
  const metadataStatus =
    curated ||
    (request.summary.mode === "manual" && request.tags.mode === "manual")
      ? "curated"
      : "provisional";
  const acceptedCopy = acceptedCopyResult(input);
  if (input.copyRequired && !acceptedCopy) {
    const failureReason =
      input.enrichment?.status === "failed" &&
      typeof input.enrichment.message === "string"
        ? input.enrichment.message.trim()
        : "";
    throw new Error(
      `Validated catalog copy is required before this project can be drafted${
        failureReason ? `: ${failureReason}` : "."
      }`,
    );
  }
  const classificationReview = sanitizedClassificationReview(input, request);
  let frontendIds = [...admitted.frontendIds];
  let frontendVocabulary;
  const warnings = [...admitted.warnings];

  if (admitted.manifest.project_type === "frontend") {
    const proposal = proposeFrontendVocabularyEntry({
      displayName: name,
      sourceIdentity: identity,
      vocabulary: input.frontendVocabulary,
      frontendProjects: input.frontendProjects ?? [],
    });
    frontendIds = [proposal.entry.id];
    frontendVocabulary = {
      frontends: [...input.frontendVocabulary.frontends, proposal.entry].sort(
        (left, right) => left.id.localeCompare(right.id),
      ),
    };
    if (proposal.warning) warnings.push(proposal.warning);
  }
  if (
    !curated &&
    (request.summary.mode === "automatic" || request.tags.mode === "automatic")
  ) {
    warnings.push(enrichmentWarning(input));
  }
  if (classificationReview.warning) warnings.push(classificationReview.warning);

  const record = {
    schema_version: 6,
    id,
    name,
    kind: admitted.manifest.project_type,
    summary,
    metadata_status: metadataStatus,
    source_id: source.id,
    frontends: [...new Set(frontendIds)].sort(),
    primary_function: primaryFunction,
    tags: [...new Set(tags)].sort(),
    ...(admitted.manifest.project_type === "preset" &&
    admitted.manifest.preset_compatibility
      ? {
          model_families: [
            ...admitted.manifest.preset_compatibility.model_families.known_ids,
          ].sort(),
          completion_formats: [
            ...admitted.manifest.preset_compatibility.completion_formats,
          ].sort(),
        }
      : {}),
    cataloged_at: now,
    catalog_cohort: "standard",
    listing_status: "active",
    listing_status_reason: null,
    ...metadataFields(source, request),
  };

  return {
    record,
    source,
    ...(snapshot ? { snapshot } : {}),
    ...(frontendVocabulary ? { frontendVocabulary } : {}),
    submitted: {
      project_type: admitted.manifest.project_type,
      primary_function: primaryFunction,
      source_url: admitted.manifest.source_url,
      frontends: admitted.manifest.frontends,
      frontend_independent: admitted.manifest.frontend_independent,
      additional_context: admitted.manifest.additional_context,
      metadata: {
        summary:
          request.summary.mode === "manual"
            ? { mode: "manual", value: request.summary.value }
            : { mode: "automatic" },
        tags:
          request.tags.mode === "manual"
            ? { mode: "manual", values: [...request.tags.values] }
            : { mode: "automatic" },
      },
      preset_compatibility: admitted.manifest.preset_compatibility,
    },
    observed: isRepositoryIdentity(identity)
      ? {
          repository: identity.repository,
          repository_id: observation.repository.id,
          canonical_url: identity.canonicalUrl,
          archived: observation.repository.archived,
          description: observation.repository.description,
        }
      : { canonical_url: identity.canonicalUrl },
    inferred: {
      project_id: id,
      name,
      summary,
      tags,
      frontend_ids: frontendIds,
    },
    metadataAuthority: input.metadataAuthority ?? {
      authorityType: "community-submitter",
      actorId: null,
      actorLogin: null,
    },
    copyResult: acceptedCopy,
    copyMode: acceptedCopy
      ? (input.copyMode ??
        (request.summary.mode === "manual" ? "preserve" : "synthesize"))
      : null,
    classificationReview: classificationReview.review,
    warnings: [...new Set(warnings)],
  };
}

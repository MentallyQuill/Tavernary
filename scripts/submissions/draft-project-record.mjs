import { defaultEnrichmentFields } from "../catalog/enrichment-policy.mjs";
import { proposeFrontendVocabularyEntry } from "./frontend-reconciliation.mjs";

function slug(value) {
  return value
    .normalize("NFKD")
    .replace(/\p{Mark}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function projectId(identity) {
  if (identity.kind === "github") {
    return `${slug(identity.owner)}-${slug(identity.name)}`;
  }
  if (identity.kind === "reddit") return `reddit-${slug(identity.postId)}`;
  const source = new URL(identity.canonicalUrl);
  return slug(`${source.hostname}-${source.pathname}`);
}

function projectSource(identity, observation) {
  if (identity.kind === "github") {
    return {
      type: "github",
      repository: identity.repository,
      repository_id: observation.repository.id,
    };
  }
  return {
    type: "url",
    url: identity.canonicalUrl,
    published_at: null,
    version: null,
    artifact_size_bytes: null,
    license_status: "pending",
    license_spdx_id: null,
  };
}

function boundedSummary(value) {
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (normalized.length <= 220) return normalized;
  const candidate = normalized.slice(0, 220);
  const boundary = candidate.lastIndexOf(" ");
  return (boundary >= 180 ? candidate.slice(0, boundary) : candidate).trimEnd();
}

function fallbackEnrichment(input, name) {
  const summary = boundedSummary(
    input.admitted.manifest.description?.trim() ||
      input.observation?.repository?.description?.trim() ||
      "No README file found.",
  );
  return {
    summary,
    metadata_status: "provisional",
    primary_function:
      input.admitted.manifest.project_type === "frontend"
        ? "frontend"
        : "uncategorized",
    capabilities: [],
    warning: input.enrichment?.message
      ? `Automated enrichment failed: ${input.enrichment.message}`
      : "Automated enrichment was unavailable; deterministic provisional metadata was used.",
    name,
  };
}

export async function draftProjectRecord(input) {
  const { admitted, observation, snapshot, now } = input;
  const identity = admitted.identity;
  const id = projectId(identity);
  if (identity.kind === "github") {
    if (
      !observation ||
      !Number.isInteger(identity.repositoryId) ||
      identity.repositoryId !== observation.repository.id
    ) {
      throw new Error(
        "GitHub observation does not match the permanent repository identity.",
      );
    }
    if (
      snapshot &&
      (snapshot.project_id !== id ||
        snapshot.repository.id !== observation.repository.id)
    ) {
      throw new Error(
        "GitHub snapshot does not match the permanent repository identity.",
      );
    }
  }
  const name =
    admitted.manifest.name?.trim() ||
    observation?.repository?.name ||
    identity.name ||
    identity.pathSlug;
  const source = projectSource(identity, observation);
  const enrichment =
    input.enrichment?.status === "curated"
      ? {
          summary: input.enrichment.summary,
          metadata_status: "curated",
          primary_function: input.enrichment.primary_function,
          capabilities: [...input.enrichment.capabilities],
          warning: null,
        }
      : fallbackEnrichment(input, name);
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
  if (enrichment.warning) warnings.push(enrichment.warning);

  const record = {
    schema_version: 5,
    id,
    name,
    kind: admitted.manifest.project_type,
    summary: enrichment.summary,
    metadata_status: enrichment.metadata_status,
    source,
    frontends: [...new Set(frontendIds)].sort(),
    primary_function: enrichment.primary_function,
    capabilities: [...new Set(enrichment.capabilities)].sort(),
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
    visibility: "published",
    visibility_reason: null,
    refresh_policy: identity.kind === "github" ? "automatic" : "paused",
    ...defaultEnrichmentFields(source),
  };

  return {
    record,
    ...(snapshot ? { snapshot } : {}),
    ...(frontendVocabulary ? { frontendVocabulary } : {}),
    submitted: {
      project_type: admitted.manifest.project_type,
      source_url: admitted.manifest.source_url,
      name: admitted.manifest.name,
      description: admitted.manifest.description,
      frontends: admitted.manifest.frontends,
      frontend_independent: admitted.manifest.frontend_independent,
      additional_context: admitted.manifest.additional_context,
      preset_compatibility: admitted.manifest.preset_compatibility,
    },
    observed:
      identity.kind === "github"
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
      summary: enrichment.summary,
      primary_function: enrichment.primary_function,
      capabilities: enrichment.capabilities,
      frontend_ids: frontendIds,
    },
    warnings: [...new Set(warnings)],
  };
}

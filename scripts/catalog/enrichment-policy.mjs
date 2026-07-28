import { parseSourceIdentity } from "../submissions/source-identity.mjs";

export const MANUAL_ENRICHMENT_REASON_CODE = "manual-enrichment-policy";

const URL_NOTE = "External URL source; requires manual curation.";
const ORGANIZATION_NOTE = "Multi-repository suite; requires manual curation.";

export function automaticEnrichmentAdapter(source) {
  if (["github", "codeberg"].includes(source?.type)) return source.type;
  if (source?.type !== "url" || typeof source.url !== "string") return null;
  try {
    return parseSourceIdentity(source.url).kind === "reddit" ? "reddit" : null;
  } catch {
    return null;
  }
}

export function supportsAutomaticEnrichmentSource(source) {
  return automaticEnrichmentAdapter(source) !== null;
}

export function defaultEnrichmentFields(source) {
  if (supportsAutomaticEnrichmentSource(source)) {
    return {
      enrichment_policy: "automatic",
    };
  }
  if (source?.type === "url") {
    return {
      enrichment_policy: "manual",
      enrichment_note: URL_NOTE,
    };
  }
  if (source?.type === "github-organization") {
    return {
      enrichment_policy: "manual",
      enrichment_note: ORGANIZATION_NOTE,
    };
  }
  throw new Error(`Unsupported source type: ${source?.type ?? "missing"}`);
}

export function isAutomaticEnrichment(record) {
  return record?.enrichment_policy === "automatic";
}

export function manualEnrichmentExclusions(records) {
  return records
    .filter((record) => !isAutomaticEnrichment(record))
    .map((record) => ({
      projectId: record.id,
      reason: MANUAL_ENRICHMENT_REASON_CODE,
      note: record.enrichment_note,
    }))
    .sort((left, right) => left.projectId.localeCompare(right.projectId));
}

export class ManualEnrichmentPolicyError extends Error {
  constructor(record) {
    const projectId = record?.id ?? "unknown-project";
    const note = record?.enrichment_note ?? "Manual curation is required.";
    super(`${projectId}: ${MANUAL_ENRICHMENT_REASON_CODE}: ${note}`);
    this.name = "ManualEnrichmentPolicyError";
    this.projectId = projectId;
    this.code = MANUAL_ENRICHMENT_REASON_CODE;
    this.note = note;
    this.enrichmentNote = note;
  }
}

export function assertAutomaticEnrichment(record) {
  if (!isAutomaticEnrichment(record)) {
    throw new ManualEnrichmentPolicyError(record);
  }
  return record;
}

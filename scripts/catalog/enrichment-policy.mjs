import { parseSourceIdentity } from "../submissions/source-identity.mjs";
import {
  automaticMetadataPolicy,
  metadataFieldsToGenerate,
} from "./metadata-policy.mjs";

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
      metadata_policy: {
        summary: automaticMetadataPolicy(),
        tags: automaticMetadataPolicy(),
      },
    };
  }
  if (source?.type === "url") {
    return {
      metadata_policy: {
        summary: { mode: "manual", note: URL_NOTE },
        tags: { mode: "manual", note: URL_NOTE },
      },
    };
  }
  if (source?.type === "github-organization") {
    return {
      metadata_policy: {
        summary: { mode: "manual", note: ORGANIZATION_NOTE },
        tags: { mode: "manual", note: ORGANIZATION_NOTE },
      },
    };
  }
  throw new Error(`Unsupported source type: ${source?.type ?? "missing"}`);
}

export function isAutomaticEnrichment(record) {
  return metadataFieldsToGenerate(record).length > 0;
}

export function manualEnrichmentExclusions(records) {
  return records
    .filter((record) => !isAutomaticEnrichment(record))
    .map((record) => ({
      projectId: record.id,
      reason: MANUAL_ENRICHMENT_REASON_CODE,
      note:
        record.metadata_policy?.summary?.note ??
        record.metadata_policy?.tags?.note ??
        "Summary and tags are manually managed.",
    }))
    .sort((left, right) => left.projectId.localeCompare(right.projectId));
}

export class ManualEnrichmentPolicyError extends Error {
  constructor(record) {
    const projectId = record?.id ?? "unknown-project";
    const note =
      record?.metadata_policy?.summary?.note ??
      record?.metadata_policy?.tags?.note ??
      "Manual curation is required.";
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

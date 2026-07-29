import { parseProjectPublicationTransaction } from "../publication/project-publication-transaction.mjs";

const SOURCE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/u;
const ISSUE_MANIFEST_KEYS = new Set([
  "schema_version",
  "request_kind",
  "operation",
  "source_id",
  "repository_id",
  "source_fingerprint",
  "proposed_cards",
  "explanation",
]);

function labels(issue) {
  return new Set(
    (issue?.labels ?? [])
      .map((label) => (typeof label === "string" ? label : label?.name))
      .filter(Boolean),
  );
}

function exactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.size &&
    Object.keys(value).every((key) => keys.has(key))
  );
}

function issueManifest(body) {
  const sections = String(body ?? "")
    .split(/^### /mu)
    .slice(1);
  const manifests = sections
    .filter(
      (section) =>
        section.split(/\r?\n/u)[0]?.trim() === "Owner request manifest",
    )
    .map((section) => section.split(/\r?\n/u).slice(1).join("\n").trim());
  if (manifests.length !== 1) return null;
  const text =
    manifests[0].match(/^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/iu)?.[1] ??
    manifests[0];
  try {
    const manifest = JSON.parse(text);
    if (
      !exactKeys(manifest, ISSUE_MANIFEST_KEYS) ||
      manifest.schema_version !== 2 ||
      manifest.request_kind !== "project-owner" ||
      manifest.operation !== "add-cards" ||
      !SOURCE_ID_PATTERN.test(manifest.source_id) ||
      !Number.isSafeInteger(manifest.repository_id) ||
      manifest.repository_id < 1 ||
      !FINGERPRINT_PATTERN.test(manifest.source_fingerprint) ||
      !Array.isArray(manifest.proposed_cards) ||
      manifest.proposed_cards.length < 1 ||
      manifest.proposed_cards.length > 10 ||
      (manifest.explanation !== null &&
        typeof manifest.explanation !== "string")
    ) {
      return null;
    }
    return manifest;
  } catch {
    return null;
  }
}

function openIssueReference(issue) {
  const issueLabels = labels(issue);
  if (
    String(issue?.state).toLocaleLowerCase() !== "open" ||
    !Number.isSafeInteger(issue?.number) ||
    issue.number < 1 ||
    !issueLabels.has("issue-admitted") ||
    !issueLabels.has("project-owner-request")
  ) {
    return null;
  }
  const manifest = issueManifest(issue.body);
  return manifest
    ? { issueNumber: issue.number, sourceId: manifest.source_id }
    : null;
}

function openPullReference(pull) {
  if (
    String(pull?.state).toLocaleLowerCase() !== "open" ||
    pull?.merged_at != null
  ) {
    return null;
  }
  const transaction = parseProjectPublicationTransaction(pull?.body ?? "");
  if (
    !transaction ||
    transaction.operation !== "add-cards" ||
    transaction.producer !== "project-owner-request" ||
    transaction.publication_mode !== "manual"
  ) {
    return null;
  }
  return {
    issueNumber: transaction.issue_number,
    sourceId: transaction.source_id,
  };
}

export function planSourceRequestAdmission(input) {
  const sourceId = input?.sourceId;
  const issueNumber = input?.issueNumber;
  if (
    !SOURCE_ID_PATTERN.test(sourceId ?? "") ||
    !Number.isSafeInteger(issueNumber) ||
    issueNumber < 1
  ) {
    throw new Error(
      "Source request admission requires a source ID and positive issue number.",
    );
  }
  const references = [
    ...(input?.issues ?? []).map(openIssueReference),
    ...(input?.pulls ?? []).map(openPullReference),
  ].filter(Boolean);
  const conflictingIssueNumber = references
    .filter(
      (reference) =>
        reference.sourceId === sourceId &&
        reference.issueNumber !== issueNumber &&
        reference.issueNumber < issueNumber,
    )
    .map((reference) => reference.issueNumber)
    .sort((left, right) => left - right)[0];
  return conflictingIssueNumber === undefined
    ? { action: "admit" }
    : {
        action: "reject",
        reasonCode: "source-request-already-open",
        conflictingIssueNumber,
      };
}

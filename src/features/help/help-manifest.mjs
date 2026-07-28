const MAX_ORIGIN_URL_LENGTH = 500;
const MAX_SITE_REVISION_LENGTH = 120;
const MAX_PROJECT_ID_LENGTH = 120;
const MAX_CANONICAL_SOURCE_LENGTH = 500;
const MAX_KIT_ID_LENGTH = 120;
const MAX_KIT_REVISION_LENGTH = 120;
const MAX_SHARE_URL_LENGTH = 500;

export const PROJECT_REPORT_CATEGORIES = Object.freeze([
  "incorrect-information",
  "source-moved-or-unavailable",
  "duplicate-or-wrong-listing",
  "unsafe-or-malicious",
  "abusive-or-inappropriate",
  "rights-concern",
  "other-listing-concern",
]);

export const WEBSITE_BUG_CATEGORIES = Object.freeze([
  "search-filter-sort",
  "navigation-link",
  "display-layout-theme",
  "form-submission-handoff",
  "kit-builder-catalog-interaction",
  "accessibility",
  "performance-loading",
  "other-website-behavior",
]);

export const KIT_REPORT_CATEGORIES = Object.freeze([
  "compatibility-problem",
  "unsafe-or-malicious-included-project",
  "abusive-or-inappropriate-content",
  "broken-removed-or-unavailable-project",
  "misleading-title-or-description",
  "duplicate-kit",
  "author-or-attribution-concern",
  "other-kit-concern",
]);

export const OTHER_HELP_CATEGORIES = Object.freeze([
  "using-tavernary",
  "existing-request",
  "suggest-improvement",
  "documentation-policy",
  "other",
]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value, keys) {
  return (
    isObject(value) && Object.keys(value).every((key) => keys.includes(key))
  );
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value, errors, invalidTypeMessage) {
  if (value === null) return null;
  if (typeof value !== "string") {
    errors.push(invalidTypeMessage);
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function validOriginUrl(value) {
  if (typeof value !== "string" || value.length > MAX_ORIGIN_URL_LENGTH) {
    return false;
  }
  if (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\")
  ) {
    return true;
  }
  return validHttpsUrl(value);
}

function validHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function addRequiredTextError(errors, value, message) {
  if (!value) errors.push(message);
}

function addMaxLengthError(errors, value, maximum, message) {
  if (value && value.length > maximum) errors.push(message);
}

function normalizeOrigin(value, errors) {
  if (!hasOnlyKeys(value, ["page_url", "site_revision"])) {
    errors.push("Help request contains unknown properties.");
  }
  const pageUrl = text(value?.page_url);
  const siteRevision = text(value?.site_revision);
  if (!validOriginUrl(pageUrl)) {
    errors.push("Help request origin URL is invalid.");
  }
  addRequiredTextError(
    errors,
    siteRevision,
    "Help request site revision is required.",
  );
  addMaxLengthError(
    errors,
    siteRevision,
    MAX_SITE_REVISION_LENGTH,
    "Help request site revision must be 120 characters or fewer.",
  );
  return { page_url: pageUrl, site_revision: siteRevision };
}

function validateCategory(errors, value, categories, message) {
  if (!categories.includes(value)) errors.push(message);
}

function normalizeProjectReport(payload, errors) {
  if (
    !hasOnlyKeys(payload, [
      "project_id",
      "canonical_source",
      "category",
      "report",
      "requested_outcome",
      "evidence",
    ])
  ) {
    errors.push("Help request contains unknown properties.");
  }
  const projectId = text(payload?.project_id);
  const canonicalSource = text(payload?.canonical_source);
  const category = text(payload?.category);
  const report = text(payload?.report);
  const requestedOutcome = nullableText(
    payload?.requested_outcome,
    errors,
    "Project report requested outcome must be a string or null.",
  );
  const evidence = nullableText(
    payload?.evidence,
    errors,
    "Project report evidence must be a string or null.",
  );

  addRequiredTextError(
    errors,
    projectId,
    "Project report project ID is required.",
  );
  addMaxLengthError(
    errors,
    projectId,
    MAX_PROJECT_ID_LENGTH,
    "Project report project ID must be 120 characters or fewer.",
  );
  if (
    !validHttpsUrl(canonicalSource) ||
    canonicalSource.length > MAX_CANONICAL_SOURCE_LENGTH
  ) {
    errors.push("Project report canonical source URL is invalid.");
  }
  validateCategory(
    errors,
    category,
    PROJECT_REPORT_CATEGORIES,
    "Project report category is invalid.",
  );
  addRequiredTextError(errors, report, "Project report is required.");
  addMaxLengthError(
    errors,
    report,
    3_000,
    "Project report must be 3,000 characters or fewer.",
  );
  addMaxLengthError(
    errors,
    requestedOutcome,
    1_000,
    "Project report requested outcome must be 1,000 characters or fewer.",
  );
  addMaxLengthError(
    errors,
    evidence,
    2_000,
    "Project report evidence must be 2,000 characters or fewer.",
  );

  return {
    project_id: projectId,
    canonical_source: canonicalSource,
    category,
    report,
    requested_outcome: requestedOutcome,
    evidence,
  };
}

function normalizeWebsiteBug(payload, errors) {
  if (
    !hasOnlyKeys(payload, [
      "category",
      "page_url",
      "actual_behavior",
      "expected_behavior",
      "reproduction_steps",
      "browser",
      "device",
      "additional_context",
    ])
  ) {
    errors.push("Help request contains unknown properties.");
  }
  const category = text(payload?.category);
  const pageUrl = text(payload?.page_url);
  const actualBehavior = text(payload?.actual_behavior);
  const expectedBehavior = text(payload?.expected_behavior);
  const reproductionSteps = text(payload?.reproduction_steps);
  const browser = nullableText(
    payload?.browser,
    errors,
    "Website browser must be a string or null.",
  );
  const device = nullableText(
    payload?.device,
    errors,
    "Website device must be a string or null.",
  );
  const additionalContext = nullableText(
    payload?.additional_context,
    errors,
    "Website additional context must be a string or null.",
  );

  validateCategory(
    errors,
    category,
    WEBSITE_BUG_CATEGORIES,
    "Website problem category is invalid.",
  );
  if (!validOriginUrl(pageUrl))
    errors.push("Website problem page URL is invalid.");
  addRequiredTextError(
    errors,
    actualBehavior,
    "Website actual behavior is required.",
  );
  addRequiredTextError(
    errors,
    expectedBehavior,
    "Website expected behavior is required.",
  );
  addRequiredTextError(
    errors,
    reproductionSteps,
    "Website reproduction steps are required.",
  );
  addMaxLengthError(
    errors,
    actualBehavior,
    2_000,
    "Website actual behavior must be 2,000 characters or fewer.",
  );
  addMaxLengthError(
    errors,
    expectedBehavior,
    1_000,
    "Website expected behavior must be 1,000 characters or fewer.",
  );
  addMaxLengthError(
    errors,
    reproductionSteps,
    2_000,
    "Website reproduction steps must be 2,000 characters or fewer.",
  );
  addMaxLengthError(
    errors,
    browser,
    120,
    "Website browser must be 120 characters or fewer.",
  );
  addMaxLengthError(
    errors,
    device,
    120,
    "Website device must be 120 characters or fewer.",
  );
  addMaxLengthError(
    errors,
    additionalContext,
    1_000,
    "Website additional context must be 1,000 characters or fewer.",
  );

  return {
    category,
    page_url: pageUrl,
    actual_behavior: actualBehavior,
    expected_behavior: expectedBehavior,
    reproduction_steps: reproductionSteps,
    browser,
    device,
    additional_context: additionalContext,
  };
}

function normalizeAffectedProjectIds(value, errors) {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    errors.push("Kit report affected project IDs are invalid.");
    return [];
  }
  const ids = [...new Set(value.map((entry) => entry.trim()).filter(Boolean))];
  if (ids.some((id) => id.length > MAX_PROJECT_ID_LENGTH)) {
    errors.push(
      "Kit report affected project IDs must be 120 characters or fewer.",
    );
  }
  if (ids.length > 50) {
    errors.push("Kit report cannot contain more than 50 affected project IDs.");
  }
  return ids;
}

function normalizeKitReport(payload, errors) {
  if (
    !hasOnlyKeys(payload, [
      "kit_id",
      "canonical_share_url",
      "kit_revision",
      "category",
      "affected_project_ids",
      "details",
      "evidence",
    ])
  ) {
    errors.push("Help request contains unknown properties.");
  }
  const kitId = text(payload?.kit_id);
  const canonicalShareUrl = text(payload?.canonical_share_url);
  const kitRevision = text(payload?.kit_revision);
  const category = text(payload?.category);
  const affectedProjectIds = normalizeAffectedProjectIds(
    payload?.affected_project_ids,
    errors,
  );
  const details = text(payload?.details);
  const evidence = nullableText(
    payload?.evidence,
    errors,
    "Kit report evidence must be a string or null.",
  );

  addRequiredTextError(errors, kitId, "Kit report Kit ID is required.");
  addMaxLengthError(
    errors,
    kitId,
    MAX_KIT_ID_LENGTH,
    "Kit report Kit ID must be 120 characters or fewer.",
  );
  if (
    !validHttpsUrl(canonicalShareUrl) ||
    canonicalShareUrl.length > MAX_SHARE_URL_LENGTH
  ) {
    errors.push("Kit report canonical share URL is invalid.");
  }
  addRequiredTextError(errors, kitRevision, "Kit report revision is required.");
  addMaxLengthError(
    errors,
    kitRevision,
    MAX_KIT_REVISION_LENGTH,
    "Kit report revision must be 120 characters or fewer.",
  );
  validateCategory(
    errors,
    category,
    KIT_REPORT_CATEGORIES,
    "Kit report category is invalid.",
  );
  addRequiredTextError(errors, details, "Kit report details are required.");
  addMaxLengthError(
    errors,
    details,
    3_000,
    "Kit report details must be 3,000 characters or fewer.",
  );
  addMaxLengthError(
    errors,
    evidence,
    2_000,
    "Kit report evidence must be 2,000 characters or fewer.",
  );

  return {
    kit_id: kitId,
    canonical_share_url: canonicalShareUrl,
    kit_revision: kitRevision,
    category,
    affected_project_ids: affectedProjectIds,
    details,
    evidence,
  };
}

function normalizeOtherHelp(payload, errors) {
  if (
    !hasOnlyKeys(payload, [
      "category",
      "subject",
      "description",
      "relevant_url",
    ])
  ) {
    errors.push("Help request contains unknown properties.");
  }
  const category = text(payload?.category);
  const subject = text(payload?.subject);
  const description = text(payload?.description);
  const relevantUrl = nullableText(
    payload?.relevant_url,
    errors,
    "Other Help relevant URL must be a string or null.",
  );

  validateCategory(
    errors,
    category,
    OTHER_HELP_CATEGORIES,
    "Other Help category is invalid.",
  );
  addRequiredTextError(errors, subject, "Other Help subject is required.");
  addRequiredTextError(
    errors,
    description,
    "Other Help description is required.",
  );
  addMaxLengthError(
    errors,
    subject,
    120,
    "Other Help subject must be 120 characters or fewer.",
  );
  addMaxLengthError(
    errors,
    description,
    3_000,
    "Other Help description must be 3,000 characters or fewer.",
  );
  if (
    relevantUrl &&
    (!validHttpsUrl(relevantUrl) || relevantUrl.length > 500)
  ) {
    errors.push(
      "Other Help relevant URL is invalid or exceeds 500 characters.",
    );
  }

  return {
    category,
    subject,
    description,
    relevant_url: relevantUrl,
  };
}

export function normalizeHelpManifest(value) {
  const errors = [];
  if (
    !hasOnlyKeys(value, ["schema_version", "request_kind", "origin", "payload"])
  ) {
    errors.push("Help request contains unknown properties.");
  }
  if (value?.schema_version !== 1) {
    errors.push("Help request must use schema version 1.");
  }
  const requestKind = text(value?.request_kind);
  const origin = normalizeOrigin(value?.origin, errors);
  let payload;
  if (requestKind === "project-report") {
    payload = normalizeProjectReport(value?.payload, errors);
  } else if (requestKind === "website-bug") {
    payload = normalizeWebsiteBug(value?.payload, errors);
  } else if (requestKind === "kit-report") {
    payload = normalizeKitReport(value?.payload, errors);
  } else if (requestKind === "other-help") {
    payload = normalizeOtherHelp(value?.payload, errors);
  } else {
    errors.push("Help request kind is invalid.");
  }

  if (errors.length > 0) {
    return { valid: false, errors: [...new Set(errors)] };
  }
  return {
    valid: true,
    manifest: {
      schema_version: 1,
      request_kind: requestKind,
      origin,
      payload,
    },
  };
}

export function serializeHelpManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

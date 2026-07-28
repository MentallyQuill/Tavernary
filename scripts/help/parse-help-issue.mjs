import { normalizeHelpManifest } from "../../src/features/help/help-manifest.mjs";

const fallbackOrigin = Object.freeze({
  page_url: "direct-github-fallback",
  site_revision: "unknown",
});

const categoryIds = Object.freeze({
  "project-report": Object.freeze({
    "Incorrect or outdated card information": "incorrect-information",
    "Repository moved, renamed, archived, or disappeared":
      "source-moved-or-unavailable",
    "Duplicate or wrong listing": "duplicate-or-wrong-listing",
    "Unsafe or malicious project": "unsafe-or-malicious",
    "Abusive or inappropriate content": "abusive-or-inappropriate",
    "Copyright, trademark, or other rights concern": "rights-concern",
    "Something else about this listing": "other-listing-concern",
  }),
  "website-bug": Object.freeze({
    "Search, filters, or sorting": "search-filter-sort",
    "Navigation or link": "navigation-link",
    "Display, layout, or theme": "display-layout-theme",
    "Form submission or GitHub handoff": "form-submission-handoff",
    "Kit builder or catalog interaction": "kit-builder-catalog-interaction",
    Accessibility: "accessibility",
    "Performance or loading": "performance-loading",
    "Other website behavior": "other-website-behavior",
  }),
  "kit-report": Object.freeze({
    "Compatibility problem": "compatibility-problem",
    "Unsafe or malicious included project":
      "unsafe-or-malicious-included-project",
    "Abusive or inappropriate content": "abusive-or-inappropriate-content",
    "Broken, removed, or unavailable project":
      "broken-removed-or-unavailable-project",
    "Misleading title or description": "misleading-title-or-description",
    "Duplicate Kit": "duplicate-kit",
    "Author or attribution concern": "author-or-attribution-concern",
    "Other Kit concern": "other-kit-concern",
  }),
  "other-help": Object.freeze({
    "Using Tavernary": "using-tavernary",
    "An existing request": "existing-request",
    "Suggest an improvement": "suggest-improvement",
    "Documentation or policy": "documentation-policy",
    "Something else": "other",
  }),
});

export const HELP_FALLBACK_HEADINGS = Object.freeze({
  "project-report": Object.freeze([
    "Project",
    "Category",
    "What should be reviewed?",
    "Requested outcome",
    "Supporting evidence",
    "Help manifest",
  ]),
  "website-bug": Object.freeze([
    "Category",
    "Page URL",
    "What happened?",
    "What did you expect?",
    "Steps to reproduce",
    "Browser",
    "Device",
    "Additional context",
    "Help manifest",
  ]),
  "other-help": Object.freeze([
    "Category",
    "Subject",
    "Description",
    "Relevant URL",
    "Help manifest",
  ]),
  "kit-report": Object.freeze([
    "Kit ID",
    "Kit share URL",
    "Category",
    "Affected project IDs",
    "Details",
    "Supporting evidence",
    "Help manifest",
  ]),
});

function readableValue(value = "") {
  const normalized = String(value).trim();
  return /^_No response_$/i.test(normalized) ? "" : normalized;
}

function collectIssueHeadings(body = "") {
  const fields = new Map();
  const duplicates = new Set();
  for (const section of String(body).split(/^### /m).slice(1)) {
    const [heading, ...content] = section.split(/\r?\n/);
    const normalizedHeading = heading.trim();
    if (!normalizedHeading) continue;
    if (fields.has(normalizedHeading)) {
      duplicates.add(normalizedHeading);
      continue;
    }
    fields.set(normalizedHeading, readableValue(content.join("\n")));
  }
  return { fields, duplicates: [...duplicates] };
}

export function parseIssueHeadings(body = "") {
  return collectIssueHeadings(body).fields;
}

function fallbackKind(fields) {
  const matches = Object.entries(HELP_FALLBACK_HEADINGS)
    .filter(([, headings]) => headings.every((heading) => fields.has(heading)))
    .map(([kind]) => kind);
  return matches.length === 1 ? matches[0] : null;
}

function renderedJson(value) {
  const fenced = value.match(/^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/i);
  return fenced?.[1] ?? value;
}

function parseManifest(value) {
  let candidate;
  try {
    candidate = JSON.parse(renderedJson(value));
  } catch {
    return {
      valid: false,
      errors: [
        "Help manifest is not valid JSON. Correct the Help manifest or leave it empty to use the readable fields.",
      ],
    };
  }
  const validation = normalizeHelpManifest(candidate);
  return validation.valid
    ? { valid: true, source: "manifest", manifest: validation.manifest }
    : { valid: false, errors: validation.errors };
}

function categoryId(kind, displayLabel) {
  return categoryIds[kind]?.[displayLabel] ?? null;
}

function unknownCategory(kind) {
  const subject = {
    "project-report": "Project report",
    "website-bug": "Website problem",
    "kit-report": "Kit report",
    "other-help": "Other Help",
  }[kind];
  return {
    valid: false,
    errors: [
      `${subject} category is not recognized. Use one of the categories listed in the form.`,
    ],
  };
}

function projectPayload(fields) {
  const project = fields.get("Project");
  const separator = project.lastIndexOf(" — ");
  if (separator < 1) {
    return {
      error:
        "Project must contain a project ID or name, an em dash, and its canonical source URL.",
    };
  }
  return {
    value: {
      project_id: project.slice(0, separator).trim(),
      canonical_source: project.slice(separator + 3).trim(),
      report: fields.get("What should be reviewed?"),
      requested_outcome: fields.get("Requested outcome") || null,
      evidence: fields.get("Supporting evidence") || null,
    },
  };
}

function websitePayload(fields) {
  return {
    value: {
      page_url: fields.get("Page URL"),
      actual_behavior: fields.get("What happened?"),
      expected_behavior: fields.get("What did you expect?"),
      reproduction_steps: fields.get("Steps to reproduce"),
      browser: fields.get("Browser") || null,
      device: fields.get("Device") || null,
      additional_context: fields.get("Additional context") || null,
    },
  };
}

function otherPayload(fields) {
  return {
    value: {
      subject: fields.get("Subject"),
      description: fields.get("Description"),
      relevant_url: fields.get("Relevant URL") || null,
    },
  };
}

function kitPayload(fields) {
  return {
    value: {
      kit_id: fields.get("Kit ID"),
      canonical_share_url: fields.get("Kit share URL"),
      kit_revision: "unknown",
      affected_project_ids: [
        ...new Set(
          fields
            .get("Affected project IDs")
            .split(/[,\r\n]+/)
            .map((entry) => entry.trim())
            .filter(Boolean),
        ),
      ],
      details: fields.get("Details"),
      evidence: fields.get("Supporting evidence") || null,
    },
  };
}

function fallbackManifest(fields, kind) {
  const displayCategory = fields.get("Category");
  const category = categoryId(kind, displayCategory);
  if (!category) return unknownCategory(kind);

  const payloadResult = {
    "project-report": projectPayload,
    "website-bug": websitePayload,
    "kit-report": kitPayload,
    "other-help": otherPayload,
  }[kind](fields);
  if (payloadResult.error) {
    return { valid: false, errors: [payloadResult.error] };
  }

  const manifest = {
    schema_version: 1,
    request_kind: kind,
    origin: fallbackOrigin,
    payload: { ...payloadResult.value, category },
  };
  const validation = normalizeHelpManifest({
    ...manifest,
    origin: { page_url: "/direct-github-fallback", site_revision: "unknown" },
  });
  if (!validation.valid) return validation;
  return { valid: true, source: "fallback", manifest };
}

export function parseHelpIssue(body = "") {
  const { fields, duplicates } = collectIssueHeadings(body);
  if (duplicates.length > 0) {
    return {
      valid: false,
      errors: duplicates.map(
        (heading) => `Help issue contains duplicate heading: ${heading}.`,
      ),
    };
  }
  const manifestValue = fields.get("Help manifest") ?? "";
  if (manifestValue) return parseManifest(manifestValue);

  const kind = fallbackKind(fields);
  if (!kind) {
    return {
      valid: false,
      errors: [
        "Help issue fields do not match one complete public Help form. Use the form's exact headings and complete its required fields.",
      ],
    };
  }
  return fallbackManifest(fields, kind);
}

import { expect, test } from "vitest";

import { parseHelpIssue } from "../../scripts/help/parse-help-issue.mjs";

function issueBody(fields: Array<[string, string]>) {
  return fields
    .map(([heading, value]) => `### ${heading}\n\n${value}`)
    .join("\n\n");
}

const projectManifest = {
  schema_version: 1,
  request_kind: "project-report",
  origin: {
    page_url: "/help/report-project/",
    site_revision: "29962b44",
  },
  payload: {
    project_id: "sillytavern-sillytavern",
    canonical_source: "https://github.com/SillyTavern/SillyTavern",
    category: "unsafe-or-malicious",
    report: "The latest release downloads an unexpected executable.",
    requested_outcome: "Temporarily hide this listing.",
    evidence: "https://github.com/SillyTavern/SillyTavern/issues/1",
  },
} as const;

test("uses a valid non-empty Help manifest before readable fields", () => {
  const body = issueBody([
    ["Project", "Wrong visible value — https://example.com/wrong"],
    ["Category", "Something else about this listing"],
    ["What should be reviewed?", "Wrong visible report"],
    ["Requested outcome", "_No response_"],
    ["Supporting evidence", "_No response_"],
    ["Help manifest", `\`\`\`json\n${JSON.stringify(projectManifest)}\n\`\`\``],
  ]);

  expect(parseHelpIssue(body)).toEqual({
    valid: true,
    source: "manifest",
    manifest: projectManifest,
  });
});

test("fails closed on a malformed non-empty manifest instead of trusting fallback fields", () => {
  const body = issueBody([
    [
      "Project",
      "sillytavern-sillytavern — https://github.com/SillyTavern/SillyTavern",
    ],
    ["Category", "Incorrect or outdated card information"],
    ["What should be reviewed?", "The summary is outdated."],
    ["Requested outcome", "_No response_"],
    ["Supporting evidence", "_No response_"],
    ["Help manifest", "```json\n{not-json}\n```"],
  ]);

  expect(parseHelpIssue(body)).toEqual({
    valid: false,
    errors: [
      "Help manifest is not valid JSON. Correct the Help manifest or leave it empty to use the readable fields.",
    ],
  });
});

test("rejects duplicate manifest headings instead of accepting an empty first value", () => {
  const body = [
    issueBody([
      [
        "Project",
        "sillytavern-sillytavern — https://github.com/SillyTavern/SillyTavern",
      ],
      ["Category", "Incorrect or outdated card information"],
      ["What should be reviewed?", "The summary is outdated."],
      ["Requested outcome", "_No response_"],
      ["Supporting evidence", "_No response_"],
      ["Help manifest", "_No response_"],
    ]),
    "### Help manifest",
    "",
    "```json",
    "{not-json}",
    "```",
  ].join("\n\n");

  expect(parseHelpIssue(body)).toEqual({
    valid: false,
    errors: ["Help issue contains duplicate heading: Help manifest."],
  });
});

test("builds a project report manifest from exact fallback headings", () => {
  const body = issueBody([
    [
      "Project",
      "sillytavern-sillytavern — https://github.com/SillyTavern/SillyTavern",
    ],
    ["Category", "Copyright, trademark, or other rights concern"],
    [
      "What should be reviewed?",
      "The project owner is attributed incorrectly.",
    ],
    ["Requested outcome", "Correct the owner attribution."],
    ["Supporting evidence", "https://github.com/SillyTavern/SillyTavern"],
    ["Help manifest", "_No response_"],
  ]);

  expect(parseHelpIssue(body)).toEqual({
    valid: true,
    source: "fallback",
    manifest: {
      schema_version: 1,
      request_kind: "project-report",
      origin: {
        page_url: "direct-github-fallback",
        site_revision: "unknown",
      },
      payload: {
        project_id: "sillytavern-sillytavern",
        canonical_source: "https://github.com/SillyTavern/SillyTavern",
        category: "rights-concern",
        report: "The project owner is attributed incorrectly.",
        requested_outcome: "Correct the owner attribution.",
        evidence: "https://github.com/SillyTavern/SillyTavern",
      },
    },
  });
});

test("builds a website bug manifest from exact fallback headings", () => {
  const body = issueBody([
    ["Category", "Accessibility"],
    ["Page URL", "https://tavernary.org/help/"],
    ["What happened?", "The focus indicator disappears."],
    ["What did you expect?", "The focused control remains visible."],
    ["Steps to reproduce", "Open Help and press Tab."],
    ["Browser", "Firefox 128"],
    ["Device", "Windows 11 desktop"],
    ["Additional context", "_No response_"],
    ["Help manifest", "_No response_"],
  ]);

  expect(parseHelpIssue(body)).toEqual({
    valid: true,
    source: "fallback",
    manifest: {
      schema_version: 1,
      request_kind: "website-bug",
      origin: {
        page_url: "direct-github-fallback",
        site_revision: "unknown",
      },
      payload: {
        category: "accessibility",
        page_url: "https://tavernary.org/help/",
        actual_behavior: "The focus indicator disappears.",
        expected_behavior: "The focused control remains visible.",
        reproduction_steps: "Open Help and press Tab.",
        browser: "Firefox 128",
        device: "Windows 11 desktop",
        additional_context: null,
      },
    },
  });
});

test("builds an Other Help manifest from exact fallback headings", () => {
  const body = issueBody([
    ["Category", "Using Tavernary"],
    ["Subject", "Finding projects by frontend"],
    ["Description", "How do I show only SillyTavern extensions?"],
    ["Relevant URL", "https://tavernary.org/"],
    ["Help manifest", "_No response_"],
  ]);

  expect(parseHelpIssue(body)).toEqual({
    valid: true,
    source: "fallback",
    manifest: {
      schema_version: 1,
      request_kind: "other-help",
      origin: {
        page_url: "direct-github-fallback",
        site_revision: "unknown",
      },
      payload: {
        category: "using-tavernary",
        subject: "Finding projects by frontend",
        description: "How do I show only SillyTavern extensions?",
        relevant_url: "https://tavernary.org/",
      },
    },
  });
});

test("builds a Kit report manifest and normalizes affected project IDs", () => {
  const body = issueBody([
    ["Kit ID", "example-kit"],
    ["Kit share URL", "https://tavernary.org/?kit=example-kit"],
    ["Category", "Compatibility problem"],
    ["Affected project IDs", "project-one, project-two\nproject-one"],
    ["Details", "These two projects cannot be enabled together."],
    ["Supporting evidence", "_No response_"],
    ["Help manifest", "_No response_"],
  ]);

  expect(parseHelpIssue(body)).toEqual({
    valid: true,
    source: "fallback",
    manifest: {
      schema_version: 1,
      request_kind: "kit-report",
      origin: {
        page_url: "direct-github-fallback",
        site_revision: "unknown",
      },
      payload: {
        kit_id: "example-kit",
        canonical_share_url: "https://tavernary.org/?kit=example-kit",
        kit_revision: "unknown",
        category: "compatibility-problem",
        affected_project_ids: ["project-one", "project-two"],
        details: "These two projects cannot be enabled together.",
        evidence: null,
      },
    },
  });
});

test("rejects unknown fallback categories with an actionable error", () => {
  const body = issueBody([
    ["Category", "An invented website category"],
    ["Page URL", "https://tavernary.org/"],
    ["What happened?", "Something happened."],
    ["What did you expect?", "Something else."],
    ["Steps to reproduce", "Open the page."],
    ["Browser", "_No response_"],
    ["Device", "_No response_"],
    ["Additional context", "_No response_"],
    ["Help manifest", "_No response_"],
  ]);

  expect(parseHelpIssue(body)).toEqual({
    valid: false,
    errors: [
      "Website problem category is not recognized. Use one of the categories listed in the form.",
    ],
  });
});

test("rejects fallback values that exceed manifest limits", () => {
  const body = issueBody([
    [
      "Project",
      "sillytavern-sillytavern — https://github.com/SillyTavern/SillyTavern",
    ],
    ["Category", "Incorrect or outdated card information"],
    ["What should be reviewed?", "x".repeat(3_001)],
    ["Requested outcome", "_No response_"],
    ["Supporting evidence", "_No response_"],
    ["Help manifest", "_No response_"],
  ]);

  expect(parseHelpIssue(body)).toEqual({
    valid: false,
    errors: ["Project report must be 3,000 characters or fewer."],
  });
});

test("does not infer a fallback route from partial or ambiguous headings", () => {
  expect(
    parseHelpIssue(
      issueBody([
        ["Category", "Accessibility"],
        ["Description", "Only headings shared by different forms."],
      ]),
    ),
  ).toEqual({
    valid: false,
    errors: [
      "Help issue fields do not match one complete public Help form. Use the form's exact headings and complete its required fields.",
    ],
  });
});

import { expect, test } from "vitest";

import {
  buildValidationComment,
  parseIssueFields,
} from "../../scripts/submissions/triage-issue.mjs";
import {
  buildKitValidationComment,
  parseKitIssueFields,
} from "../../scripts/submissions/triage-kit-issue.mjs";

test("parses only the minimal fields used by automated triage", () => {
  expect(
    parseIssueFields(`
### Project Type

Extension

### Project URL

https://github.com/MentallyQuill/Recursion

### Anything we should know?

This is an unusual installation.
`),
  ).toEqual({
    kind: "Extension",
    sourceUrl: "https://github.com/MentallyQuill/Recursion",
  });
});

test("builds a stable marker comment for validation failures", () => {
  expect(
    buildValidationComment({
      labels: ["needs-information"],
      errors: ["Frontends and Extensions require a public GitHub repository."],
    }),
  ).toBe(
    [
      "<!-- tavernary-submission-validation -->",
      "Tavernary could not send this submission to maintainer review:",
      "",
      "- Frontends and Extensions require a public GitHub repository.",
      "",
      "Edit the issue fields above and automated validation will run again.",
    ].join("\n"),
  );
});

test("parses Kit manifests and builds a stable success comment", () => {
  expect(
    parseKitIssueFields(`
### Kit manifest

{"operation":"create"}
`),
  ).toEqual({ manifest: '{"operation":"create"}' });
  expect(
    buildKitValidationComment({
      valid: true,
      manifest: null,
      labels: ["needs-maintainer-review"],
      errors: [],
      warnings: [],
    }),
  ).toContain(
    "Automated validation now passes. This Kit is ready for maintainer review.",
  );
});

test("unwraps GitHub's rendered JSON fence from a Kit manifest", () => {
  expect(
    parseKitIssueFields(`
### Kit title

Ultimate Harry Potter

### Kit manifest

\`\`\`json
{
  "operation": "create",
  "kit_id": null,
  "project_ids": ["sillytavern-sillytavern"]
}
\`\`\`
`),
  ).toEqual({
    manifest: [
      "{",
      '  "operation": "create",',
      '  "kit_id": null,',
      '  "project_ids": ["sillytavern-sillytavern"]',
      "}",
    ].join("\n"),
  });
});

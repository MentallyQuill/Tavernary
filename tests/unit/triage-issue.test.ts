import { expect, test } from "vitest";

import {
  buildValidationComment,
  parseIssueFields,
} from "../../scripts/submissions/triage-issue.mjs";

test("parses the issue-form fields used by automated triage", () => {
  expect(
    parseIssueFields(`
### Project kind

Extension

### Canonical source URL

https://github.com/MentallyQuill/Recursion
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
      "Tavernary could not send this submission to curator review:",
      "",
      "- Frontends and Extensions require a public GitHub repository.",
      "",
      "Edit the issue fields above and automated validation will run again.",
    ].join("\n"),
  );
});

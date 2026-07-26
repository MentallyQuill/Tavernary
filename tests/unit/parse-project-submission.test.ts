import { expect, test } from "vitest";

import { parseProjectSubmissionIssue } from "../../scripts/submissions/parse-project-submission.mjs";

test("parses the fallback form into the shared contract", () => {
  const result = parseProjectSubmissionIssue(`
### Project Type
Extension
### Project URL
https://github.com/Owner/Repo
### Project Name
Example
### Short Description
_No response_
### Supported frontends
SillyTavern, https://github.com/prolix-oc/Lumiverse
### Frontend-independent
No
### Anything we should know?
_No response_
### Project manifest
_No response_
`);

  expect(result).toMatchObject({
    valid: true,
    source: "headings",
    manifest: {
      project_type: "extension",
      source_url: "https://github.com/Owner/Repo",
      name: "Example",
      frontends: {
        known_ids: [],
        other: [
          { name: "SillyTavern", url: "" },
          { name: "", url: "https://github.com/prolix-oc/Lumiverse" },
        ],
      },
    },
  });
});

test("prefers a non-empty embedded manifest over readable headings", () => {
  const result = parseProjectSubmissionIssue(`
### Project Type
Frontend
### Project URL
https://github.com/Wrong/Heading
### Project manifest
\`\`\`json
{
  "schema_version": 1,
  "project_type": "extension",
  "source_url": "https://github.com/Owner/Repo",
  "name": "Example",
  "description": null,
  "frontends": { "known_ids": ["sillytavern"], "other": [] },
  "frontend_independent": false,
  "additional_context": null
}
\`\`\`
`);

  expect(result).toMatchObject({
    valid: true,
    source: "manifest",
    manifest: {
      project_type: "extension",
      source_url: "https://github.com/Owner/Repo",
    },
  });
});

test("rejects malformed embedded JSON instead of falling back to headings", () => {
  expect(
    parseProjectSubmissionIssue(`
### Project Type
Frontend
### Project URL
https://github.com/Owner/Valid
### Project manifest
{not-json}
`),
  ).toEqual({
    valid: false,
    source: "manifest",
    errors: ["Project manifest must be valid JSON."],
  });
});

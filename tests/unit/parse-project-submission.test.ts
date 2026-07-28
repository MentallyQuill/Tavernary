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

test("treats GitHub's empty rendered JSON fence as an omitted manifest", () => {
  const result = parseProjectSubmissionIssue(`
### Project Type
Extension
### Project URL
https://codeberg.org/targren/Lumiverse-SwipeScrubber
### Project Name
Swipe Scrubber
### Short Description
Remove unused swipes from message history.
### Supported frontends
Lumiverse
### Frontend-independent
No
### Anything we should know?
Entered manually.
### Project manifest
\`\`\`json

\`\`\`
`);

  expect(result).toMatchObject({
    valid: true,
    source: "headings",
    manifest: {
      project_type: "extension",
      source_url: "https://codeberg.org/targren/Lumiverse-SwipeScrubber",
      name: "Swipe Scrubber",
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

test("parses fallback Preset compatibility fields into manifest version 2", () => {
  const result = parseProjectSubmissionIssue(`
### Project Type
System Preset
### Project URL
https://github.com/Owner/Preset
### Project Name
Example
### Supported frontends
SillyTavern
### Frontend-independent
No
### Supported model families
- [x] claude
- [ ] gpt
- [x] gemini
### Other model family
FutureModel
### Completion formats
- [x] chat-completion
- [x] text-completion
### Project manifest
_No response_
`);

  expect(result).toMatchObject({
    valid: true,
    source: "headings",
    manifest: {
      schema_version: 2,
      project_type: "preset",
      preset_compatibility: {
        model_families: {
          known_ids: ["claude", "gemini"],
          other: ["FutureModel"],
        },
        completion_formats: ["chat-completion", "text-completion"],
      },
    },
  });
});

test("parses text Preset compatibility fields into manifest version 2", () => {
  const result = parseProjectSubmissionIssue(`
### Project Type
System Preset
### Project URL
https://github.com/Owner/Preset
### Project Name
Example
### Supported frontends
SillyTavern
### Frontend-independent
No
### Supported model families
claude
gemini
### Other model family
FutureModel
### Completion formats
chat-completion, text-completion
### Project manifest
_No response_
`);

  expect(result).toMatchObject({
    valid: true,
    source: "headings",
    manifest: {
      schema_version: 2,
      project_type: "preset",
      frontend_independent: false,
      preset_compatibility: {
        model_families: {
          known_ids: ["claude", "gemini"],
          other: ["FutureModel"],
        },
        completion_formats: ["chat-completion", "text-completion"],
      },
    },
  });
});

test("rejects invalid frontend-independent fallback text", () => {
  expect(
    parseProjectSubmissionIssue(`
### Project Type
Frontend
### Project URL
https://github.com/Owner/Frontend
### Frontend-independent
Sometimes
### Project manifest
_No response_
`),
  ).toEqual({
    valid: false,
    source: "headings",
    errors: ["Frontend-independent must be Yes or No."],
  });
});

test("rejects unknown text compatibility values", () => {
  const result = parseProjectSubmissionIssue(`
### Project Type
System Preset
### Project URL
https://github.com/Owner/Preset
### Frontend-independent
No
### Supported model families
claude
unknown-family
### Completion formats
chat-completion
unknown-format
### Project manifest
_No response_
`);

  expect(result).toMatchObject({
    valid: false,
    source: "headings",
    errors: expect.arrayContaining([
      "Unknown model family: unknown-family.",
      "Unknown completion format: unknown-format.",
    ]),
  });
});

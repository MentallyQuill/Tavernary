import { expect, test, vi } from "vitest";

import {
  buildProjectSubmissionTriage,
  buildValidationComment,
  parseIssueFields,
  parseProjectSubmissionStateMarker,
  processProjectSubmissionTriage,
  synchronizeProjectSubmissionTriage,
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

test("updates a generic title and records the generated title marker", () => {
  const mutation = buildProjectSubmissionTriage(
    {
      status: "admitted",
      manifest: {
        schema_version: 1,
        project_type: "extension",
        source_url: "https://github.com/owner/repo",
        name: null,
        description: null,
        frontends: { known_ids: ["sillytavern"], other: [] },
        frontend_independent: false,
        additional_context: null,
      },
      identity: {
        kind: "github",
        canonicalUrl: "https://github.com/owner/repo",
        repository: "owner/repo",
        repositoryId: 42,
        owner: "owner",
        name: "repo",
      },
      frontendIds: ["sillytavern"],
      warnings: [],
    },
    {
      issueNumber: 123,
      currentTitle: "[Project submission]",
      currentLabels: [],
      generatedTitle: "[Project submission] owner/repo",
      previousMarker: null,
    },
  );

  expect(mutation).toMatchObject({
    desiredTitle: "[Project submission] owner/repo",
    labels: ["needs-maintainer-review"],
    close: false,
    dispatchGeneration: true,
  });
  expect(mutation.commentBody).toContain(
    '{"schema_version":1,"generated_title":"[Project submission] owner/repo","status":"admitted"}',
  );
});

test("updates an automation-owned title when the submitted URL changes", () => {
  const mutation = buildProjectSubmissionTriage(
    {
      status: "retryable",
      code: "source-timeout",
      message: "Try again later.",
    },
    {
      issueNumber: 123,
      currentTitle: "[Project submission] old/repo",
      currentLabels: [],
      generatedTitle: "[Project submission] new/repo",
      previousMarker: {
        schema_version: 1,
        generated_title: "[Project submission] old/repo",
        status: "admitted",
      },
    },
  );

  expect(mutation.desiredTitle).toBe("[Project submission] new/repo");
});

test("preserves a title manually customized by a maintainer", () => {
  const mutation = buildProjectSubmissionTriage(
    {
      status: "retryable",
      code: "source-timeout",
      message: "Try again later.",
    },
    {
      issueNumber: 123,
      currentTitle: "Please review Nova manually",
      currentLabels: [],
      generatedTitle: "[Project submission] new/repo",
      previousMarker: {
        schema_version: 1,
        generated_title: "[Project submission] old/repo",
        status: "admitted",
      },
    },
  );

  expect(mutation.desiredTitle).toBe("Please review Nova manually");
  expect(mutation.marker.generated_title).toBe("[Project submission] new/repo");
});

test("links the existing project and closes duplicate issues", () => {
  const mutation = buildProjectSubmissionTriage(
    {
      status: "duplicate",
      identity: {
        kind: "external",
        canonicalUrl: "https://example.com/preset",
        hostname: "example.com",
        pathSlug: "preset",
      },
      existingProject: {
        id: "existing-preset",
        name: "Existing Preset",
        canonicalUrl: "https://tavernary.example/projects/existing-preset",
      },
    },
    {
      issueNumber: 124,
      currentTitle: "[Project submission]",
      currentLabels: ["issue-admitted"],
      generatedTitle: "[Project submission] example.com/preset",
      previousMarker: null,
    },
  );

  expect(mutation).toMatchObject({
    labels: ["issue-admitted", "duplicate-candidate"],
    close: true,
    closeReason: "not_planned",
    dispatchGeneration: false,
  });
  expect(mutation.commentBody).toContain(
    "[Existing Preset](https://tavernary.example/projects/existing-preset)",
  );
});

test("does not dispatch a second generation while a submission PR is open", () => {
  const mutation = buildProjectSubmissionTriage(
    {
      status: "admitted",
      manifest: {
        schema_version: 1,
        project_type: "preset",
        source_url: "https://example.com/preset",
        name: "Preset",
        description: "A preset.",
        frontends: { known_ids: [], other: [] },
        frontend_independent: true,
        additional_context: null,
      },
      identity: {
        kind: "external",
        canonicalUrl: "https://example.com/preset",
        hostname: "example.com",
        pathSlug: "preset",
      },
      frontendIds: [],
      warnings: [],
    },
    {
      issueNumber: 125,
      currentTitle: "[Project submission] example.com/preset",
      currentLabels: ["submission-pr-open"],
      generatedTitle: "[Project submission] example.com/preset",
      previousMarker: null,
    },
  );

  expect(mutation.labels).toEqual(["submission-pr-open"]);
  expect(mutation.dispatchGeneration).toBe(false);
});

test("updates the stable state comment instead of creating a duplicate", async () => {
  const mutation = buildProjectSubmissionTriage(
    {
      status: "retryable",
      code: "source-timeout",
      message: "Try again later.",
    },
    {
      issueNumber: 126,
      currentTitle: "[Project submission] owner/repo",
      currentLabels: ["needs-maintainer-review"],
      generatedTitle: "[Project submission] owner/repo",
      previousMarker: {
        schema_version: 1,
        generated_title: "[Project submission] owner/repo",
        status: "admitted",
      },
    },
  );
  const api = {
    updateIssue: vi.fn(),
    replaceLabels: vi.fn(),
    listComments: vi.fn().mockResolvedValue([
      {
        id: 99,
        body: [
          "<!-- tavernary-project-submission-state",
          '{"schema_version":1,"generated_title":"[Project submission] owner/repo","status":"admitted"}',
          "-->",
          "Old state.",
        ].join("\n"),
      },
    ]),
    updateComment: vi.fn(),
    createComment: vi.fn(),
  };

  await synchronizeProjectSubmissionTriage(mutation, {
    issue: {
      number: 126,
      title: "[Project submission] owner/repo",
      labels: ["needs-maintainer-review"],
      state: "open",
    },
    api,
  });

  expect(api.updateComment).toHaveBeenCalledWith(99, mutation.commentBody);
  expect(api.createComment).not.toHaveBeenCalled();
});

test("parses the stable submission state marker", () => {
  expect(
    parseProjectSubmissionStateMarker(
      [
        "<!-- tavernary-project-submission-state",
        '{"schema_version":1,"generated_title":"[Project submission] owner/repo","status":"admitted"}',
        "-->",
        "Current state.",
      ].join("\n"),
    ),
  ).toEqual({
    schema_version: 1,
    generated_title: "[Project submission] owner/repo",
    status: "admitted",
  });
});

test("processes an admitted issue through injected GitHub mutations", async () => {
  const requests: Array<{
    path: string;
    method: string;
    body?: string;
  }> = [];
  const request = vi.fn(async (path: string, options = {}) => {
    const method = options.method ?? "GET";
    requests.push({ path, method, body: options.body });
    if (path === "/repos/owner/repo") {
      return {
        id: 42,
        owner: { login: "owner" },
        name: "repo",
        html_url: "https://github.com/owner/repo",
        visibility: "public",
        private: false,
        archived: false,
      };
    }
    if (path.endsWith("/comments?per_page=100")) return [];
    return {};
  });
  const outputs: Record<string, string> = {};

  const decision = await processProjectSubmissionTriage({
    event: {
      repository: { full_name: "Tavernary/Tavernary" },
      issue: {
        number: 127,
        title: "[Project submission]",
        body: [
          "### Project manifest",
          "",
          "```json",
          JSON.stringify({
            schema_version: 1,
            project_type: "extension",
            source_url: "https://github.com/owner/repo",
            name: "Example",
            description: null,
            frontends: { known_ids: ["sillytavern"], other: [] },
            frontend_independent: false,
            additional_context: null,
          }),
          "```",
        ].join("\n"),
        labels: ["issue-admitted"],
        state: "open",
      },
    },
    request,
    catalogData: {
      vocabulary: {
        frontends: [
          {
            id: "sillytavern",
            label: "SillyTavern",
            description: "Works with the SillyTavern roleplay frontend.",
          },
        ],
      },
      projects: [],
    },
    writeOutput: async (name, value) => {
      outputs[name] = value;
    },
  });

  expect(decision.status).toBe("admitted");
  expect(outputs).toEqual({ admitted: "true", issue_number: "127" });
  expect(requests).toContainEqual(
    expect.objectContaining({
      path: "/repos/Tavernary/Tavernary/issues/127",
      method: "PATCH",
      body: JSON.stringify({ title: "[Project submission] owner/repo" }),
    }),
  );
});

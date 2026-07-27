import { expect, test, vi } from "vitest";

import {
  buildProjectSubmissionTriage,
  buildValidationComment,
  inspectProjectSubmissionSource,
  parseIssueFields,
  parseProjectSubmissionStateMarker,
  processProjectSubmissionTriage,
  resolveProjectSubmissionEvent,
  synchronizeProjectSubmissionTriage,
} from "../../scripts/submissions/triage-issue.mjs";
import {
  assertKitSubmissionEligible,
  buildKitValidationComment,
  kitTriageOutputs,
  parseKitIssueFields,
  resolveKitSubmissionEvent,
  synchronizeKitSubmission,
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
      labels: ["kit-publication-ready"],
      errors: [],
      warnings: [],
    }),
  ).toContain("Automated validation passes. Tavernary is publishing this Kit.");
});

test("emits publication outputs only for a valid Kit", () => {
  const manifest = {
    operation: "create" as const,
    kit_id: null,
    title: "Story Kit",
    description: "A complete storytelling stack.",
    project_ids: ["frontend", "memory", "writer"],
  };
  expect(
    kitTriageOutputs(
      {
        valid: true,
        manifest,
        labels: ["kit-publication-ready"],
        errors: [],
        warnings: [],
      },
      { number: 241 },
    ),
  ).toEqual({ publish: "true", issue_number: "241" });
  expect(
    kitTriageOutputs(
      {
        valid: false,
        manifest: null,
        labels: ["needs-information"],
        errors: ["Title contains language Tavernary doesn't allow."],
        warnings: [],
      },
      { number: 241 },
    ),
  ).toEqual({ publish: "false", issue_number: "241" });
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
    labels: ["project-submission", "needs-maintainer-review"],
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
    labels: ["issue-admitted", "project-submission", "duplicate-candidate"],
    close: true,
    closeReason: "not_planned",
    dispatchGeneration: false,
  });
  expect(mutation.commentBody).toContain(
    "[Existing Preset](https://tavernary.example/projects/existing-preset)",
  );
});

test("closes a later in-flight duplicate and links its surviving review", () => {
  const identity = {
    kind: "github" as const,
    canonicalUrl: "https://github.com/owner/repo",
    repository: "owner/repo",
    repositoryId: 42,
    owner: "owner",
    name: "repo",
  };
  const mutation = buildProjectSubmissionTriage(
    {
      status: "inflight-duplicate",
      identity,
      existingSubmission: {
        issueNumber: 72,
        issueUrl: "https://github.com/Tavernary/Tavernary/issues/72",
        prNumber: 73,
        prUrl: "https://github.com/Tavernary/Tavernary/pull/73",
        identity,
      },
    },
    {
      issueNumber: 74,
      currentTitle: "[Project submission]",
      currentLabels: [
        "issue-admitted",
        "needs-maintainer-review",
        "submission-pr-open",
      ],
      generatedTitle: "[Project submission] owner/repo",
      previousMarker: null,
    },
  );

  expect(mutation).toMatchObject({
    labels: expect.arrayContaining([
      "project-submission",
      "duplicate-candidate",
    ]),
    close: true,
    closeReason: "not_planned",
    dispatchGeneration: false,
  });
  expect(mutation.labels).not.toContain("needs-maintainer-review");
  expect(mutation.labels).not.toContain("submission-pr-open");
  expect(mutation.commentBody).toContain("issue #72");
  expect(mutation.commentBody).toContain("PR #73");
  expect(mutation.commentBody).toContain("review continues");
});

test("links only the surviving issue when its PR has not started", () => {
  const identity = {
    kind: "github" as const,
    canonicalUrl: "https://github.com/owner/repo",
    repository: "owner/repo",
    repositoryId: 42,
    owner: "owner",
    name: "repo",
  };
  const mutation = buildProjectSubmissionTriage(
    {
      status: "inflight-duplicate",
      identity,
      existingSubmission: {
        issueNumber: 72,
        issueUrl: "https://github.com/Tavernary/Tavernary/issues/72",
        prNumber: null,
        prUrl: null,
        identity,
      },
    },
    {
      issueNumber: 74,
      currentTitle: "[Project submission]",
      currentLabels: ["issue-admitted"],
      generatedTitle: "[Project submission] owner/repo",
      previousMarker: null,
    },
  );

  expect(mutation.commentBody).toContain(
    "[issue #72](https://github.com/Tavernary/Tavernary/issues/72)",
  );
  expect(mutation.commentBody).not.toContain("PR #");
  expect(mutation.commentBody).not.toContain("undefined");
});

test("keeps missing frontend dependencies open with an actionable response", () => {
  const mutation = buildProjectSubmissionTriage(
    {
      status: "needs-information",
      errors: ["Aikobots is not currently indexed as a Tavernary frontend."],
      suggestions: [],
      frontendDependencies: [
        {
          name: "Aikobots",
          canonicalUrl: "https://github.com/aikohanasaki/Aikobots",
          repository: "aikohanasaki/Aikobots",
        },
      ],
    },
    {
      issueNumber: 23,
      currentTitle:
        "[Project submission] aikohanasaki/SillyTavern-WorldInfoLocks",
      currentLabels: ["issue-admitted"],
      generatedTitle:
        "[Project submission] aikohanasaki/SillyTavern-WorldInfoLocks",
      previousMarker: null,
    },
  );

  expect(mutation).toMatchObject({
    labels: ["issue-admitted", "project-submission", "needs-information"],
    close: false,
    dispatchGeneration: false,
    marker: {
      frontend_dependencies: [
        {
          name: "Aikobots",
          canonical_url: "https://github.com/aikohanasaki/Aikobots",
          repository: "aikohanasaki/Aikobots",
        },
      ],
    },
  });
  expect(mutation.commentBody).toContain(
    "**Aikobots is not currently indexed as a Tavernary frontend.**",
  );
  expect(mutation.commentBody).toContain(
    "project-type=Frontend&project-url=https%3A%2F%2Fgithub.com%2Faikohanasaki%2FAikobots",
  );
  expect(mutation.commentBody).toContain(
    "This issue will remain open and retry automatically after that frontend is merged.",
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

  expect(mutation.labels).toEqual(["project-submission", "submission-pr-open"]);
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
    synchronizeLabels: vi.fn(),
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

test("parses frontend dependencies from the stable state marker", () => {
  expect(
    parseProjectSubmissionStateMarker(
      [
        "<!-- tavernary-project-submission-state",
        JSON.stringify({
          schema_version: 1,
          generated_title:
            "[Project submission] aikohanasaki/SillyTavern-WorldInfoLocks",
          status: "needs-information",
          frontend_dependencies: [
            {
              name: "Aikobots",
              canonical_url: "https://github.com/aikohanasaki/Aikobots",
              repository: "aikohanasaki/Aikobots",
            },
          ],
        }),
        "-->",
      ].join("\n"),
    ),
  ).toEqual({
    schema_version: 1,
    generated_title:
      "[Project submission] aikohanasaki/SillyTavern-WorldInfoLocks",
    status: "needs-information",
    frontend_dependencies: [
      {
        name: "Aikobots",
        canonical_url: "https://github.com/aikohanasaki/Aikobots",
        repository: "aikohanasaki/Aikobots",
      },
    ],
  });
});

test("rejects malformed frontend dependencies in the state marker", () => {
  expect(
    parseProjectSubmissionStateMarker(
      [
        "<!-- tavernary-project-submission-state",
        JSON.stringify({
          schema_version: 1,
          generated_title: "[Project submission] owner/repo",
          status: "needs-information",
          frontend_dependencies: [
            {
              name: "Aikobots",
              canonical_url: "",
              repository: "aikohanasaki/Aikobots",
            },
          ],
        }),
        "-->",
      ].join("\n"),
    ),
  ).toBeNull();
});

test("accepts Reddit permalinks without an anonymous availability probe", async () => {
  const result = await inspectProjectSubmissionSource(
    {
      schema_version: 1,
      project_type: "preset",
      source_url:
        "https://old.reddit.com/r/SillyTavernAI/comments/1v64r6z/update_writers_block_5_a_prose_and_narrative/",
      name: "Writer's Block 5",
      description: "A narrative-focused preset.",
      frontends: { known_ids: ["sillytavern"], other: [] },
      frontend_independent: false,
      additional_context: null,
    },
    {
      request: vi.fn(),
      probe: async () => {
        throw new Error("Reddit availability probe must not run.");
      },
    },
  );

  expect(result).toMatchObject({
    identity: {
      kind: "reddit",
      postId: "1v64r6z",
      canonicalUrl:
        "https://www.reddit.com/r/SillyTavernAI/comments/1v64r6z/update_writers_block_5_a_prose_and_narrative/",
    },
    sourceProbe: { status: "ok", httpStatus: null },
  });
});

test("processes an admitted issue through injected GitHub mutations", async () => {
  const currentBody = [
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
  ].join("\n");
  const requests: Array<{
    path: string;
    method: string;
    body?: string;
  }> = [];
  let issueReads = 0;
  const request = vi.fn(async (path: string, options = {}) => {
    const method = options.method ?? "GET";
    requests.push({ path, method, body: options.body });
    if (
      path.startsWith(
        "/repos/Tavernary/Tavernary/issues?state=open&labels=project-submission%2Cissue-admitted",
      )
    ) {
      return [];
    }
    if (path === "/repos/Tavernary/Tavernary/issues/127" && method === "GET") {
      issueReads += 1;
      return {
        number: 127,
        title: "[Project submission]",
        body: currentBody,
        labels:
          issueReads === 1
            ? ["issue-admitted"]
            : [
                "issue-admitted",
                "project-submission",
                "maintainer-label",
                "submission-retryable",
              ],
        state: "open",
      };
    }
    if (path.endsWith("/labels/submission-retryable")) {
      throw Object.assign(new Error("Label no longer exists."), {
        status: 404,
      });
    }
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
        body: "",
        labels: [],
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
  expect(requests).toContainEqual({
    path: "/repos/Tavernary/Tavernary/issues/127",
    method: "GET",
    body: undefined,
  });
  expect(issueReads).toBe(3);
  expect(requests).toContainEqual(
    expect.objectContaining({
      path: "/repos/Tavernary/Tavernary/issues/127",
      method: "PATCH",
      body: JSON.stringify({ title: "[Project submission] owner/repo" }),
    }),
  );
  expect(requests).toContainEqual({
    path: "/repos/Tavernary/Tavernary/issues/127/labels",
    method: "POST",
    body: JSON.stringify({
      labels: ["needs-maintainer-review"],
    }),
  });
  expect(requests.some(({ method }) => method === "PUT")).toBe(false);
  expect(requests).toContainEqual({
    path: "/repos/Tavernary/Tavernary/issues/127/labels/submission-retryable",
    method: "DELETE",
    body: undefined,
  });
});

test("closes a later issue when an earlier admitted submission has the same source", async () => {
  const projectBody = [
    "### Project manifest",
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
  ].join("\n");
  const requests: Array<{
    path: string;
    method: string;
    body?: string;
  }> = [];
  const request = vi.fn(async (path: string, options = {}) => {
    const method = options.method ?? "GET";
    requests.push({ path, method, body: options.body });
    if (path === "/repos/Tavernary/Tavernary/issues/74" && method === "GET") {
      return {
        number: 74,
        title: "[Project submission] owner/repo",
        body: projectBody,
        labels: ["issue-admitted", "project-submission"],
        state: "open",
      };
    }
    if (
      path.startsWith(
        "/repos/Tavernary/Tavernary/issues?state=open&labels=project-submission%2Cissue-admitted",
      )
    ) {
      return [
        {
          number: 72,
          html_url: "https://github.com/Tavernary/Tavernary/issues/72",
          state: "open",
          title: "[Project submission] owner/repo",
          body: projectBody,
          labels: [{ name: "project-submission" }, { name: "issue-admitted" }],
        },
      ];
    }
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
    if (path.includes("/pulls?")) {
      return [
        {
          number: 73,
          html_url: "https://github.com/Tavernary/Tavernary/pull/73",
        },
      ];
    }
    if (path.endsWith("/comments?per_page=100")) return [];
    return {};
  });
  const outputs: Record<string, string> = {};

  const decision = await processProjectSubmissionTriage({
    event: {
      repository: { full_name: "Tavernary/Tavernary" },
      issue: { number: 74 },
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

  expect(decision.status).toBe("inflight-duplicate");
  expect(outputs).toEqual({ admitted: "false", issue_number: "74" });
  expect(requests).toContainEqual(
    expect.objectContaining({
      path: "/repos/Tavernary/Tavernary/issues/74",
      method: "PATCH",
      body: JSON.stringify({
        state: "closed",
        state_reason: "not_planned",
      }),
    }),
  );
  expect(requests).toContainEqual(
    expect.objectContaining({
      path: "/repos/Tavernary/Tavernary/issues/74/labels",
      method: "POST",
      body: JSON.stringify({ labels: ["duplicate-candidate"] }),
    }),
  );
});

test("keeps the issue retryable when the admitted submission inventory is unavailable", async () => {
  const body = [
    "### Project manifest",
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
  ].join("\n");
  const request = vi.fn(async (path: string, options = {}) => {
    if (
      path === "/repos/Tavernary/Tavernary/issues/75" &&
      (options.method ?? "GET") === "GET"
    ) {
      return {
        number: 75,
        title: "[Project submission]",
        body,
        labels: ["issue-admitted", "project-submission"],
        state: "open",
      };
    }
    if (
      path.startsWith(
        "/repos/Tavernary/Tavernary/issues?state=open&labels=project-submission%2Cissue-admitted",
      )
    ) {
      throw new Error("GitHub 503");
    }
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
      issue: { number: 75 },
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

  expect(decision).toEqual({
    status: "retryable",
    code: "submission-inventory-unavailable",
    message: "GitHub 503",
  });
  expect(outputs).toEqual({ admitted: "false", issue_number: "75" });
  expect(outputs.admitted).not.toBe("true");
});

test("accepts a manually customized project title after routing", async () => {
  const body = [
    "### Project manifest",
    "```json",
    JSON.stringify({
      schema_version: 1,
      project_type: "preset",
      source_url: "https://example.com/preset",
      name: "Example",
      description: null,
      frontends: { known_ids: [], other: [] },
      frontend_independent: true,
      additional_context: null,
    }),
    "```",
  ].join("\n");
  const updates: unknown[] = [];
  const request = vi.fn(async (path: string, options = {}) => {
    if (
      path.startsWith(
        "/repos/Tavernary/Tavernary/issues?state=open&labels=project-submission%2Cissue-admitted",
      )
    ) {
      return [];
    }
    if (path === "/repos/Tavernary/Tavernary/issues/128") {
      if ((options.method ?? "GET") === "PATCH") updates.push(options);
      return {
        number: 128,
        title: "Maintainer-approved custom title",
        body,
        labels: ["issue-admitted", "project-submission"],
        state: "open",
      };
    }
    if (path.endsWith("/comments?per_page=100")) return [];
    return {};
  });

  await expect(
    processProjectSubmissionTriage({
      event: {
        repository: { full_name: "Tavernary/Tavernary" },
        issue: { number: 128 },
      },
      request,
      probe: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        finalUrl: "https://example.com/preset",
      }),
      catalogData: { vocabulary: { frontends: [] }, projects: [] },
    }),
  ).resolves.toBeDefined();
  expect(updates).toEqual([]);
});

test("does not apply a stale decision after the issue body changes", async () => {
  const originalBody = [
    "### Project manifest",
    "```json",
    JSON.stringify({
      schema_version: 1,
      project_type: "preset",
      source_url: "https://example.com/original",
      name: "Original",
      description: null,
      frontends: { known_ids: [], other: [] },
      frontend_independent: true,
      additional_context: null,
    }),
    "```",
  ].join("\n");
  let reads = 0;
  const request = vi.fn(async (path: string, options = {}) => {
    if (
      path.startsWith(
        "/repos/Tavernary/Tavernary/issues?state=open&labels=project-submission%2Cissue-admitted",
      )
    ) {
      return [];
    }
    if (
      path === "/repos/Tavernary/Tavernary/issues/129" &&
      (options.method ?? "GET") === "GET"
    ) {
      reads += 1;
      return {
        number: 129,
        title: "[Project submission]",
        body: reads < 3 ? originalBody : `${originalBody}\nchanged`,
        labels: ["issue-admitted", "project-submission"],
        state: "open",
      };
    }
    return {};
  });

  await expect(
    processProjectSubmissionTriage({
      event: {
        repository: { full_name: "Tavernary/Tavernary" },
        issue: { number: 129 },
      },
      request,
      probe: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        finalUrl: "https://example.com/original",
      }),
      catalogData: { vocabulary: { frontends: [] }, projects: [] },
    }),
  ).rejects.toThrow("Project submission changed during triage.");
  expect(
    request.mock.calls.some(
      ([path, options]) =>
        path === "/repos/Tavernary/Tavernary/issues/129" &&
        ["PATCH", "PUT", "DELETE"].includes(options?.method),
    ),
  ).toBe(false);
});

test("does not dispatch after the routing label is revoked", async () => {
  let reads = 0;
  const request = vi.fn(async (path: string, options = {}) => {
    if (
      path === "/repos/Tavernary/Tavernary/issues/131" &&
      (options.method ?? "GET") === "GET"
    ) {
      reads += 1;
      return {
        number: 131,
        title: "[Project submission]",
        body: "### Project manifest\ninvalid",
        labels:
          reads < 3
            ? ["issue-admitted", "project-submission"]
            : ["issue-admitted"],
        state: "open",
      };
    }
    return {};
  });
  const writeOutput = vi.fn();

  await expect(
    processProjectSubmissionTriage({
      event: {
        repository: { full_name: "Tavernary/Tavernary" },
        issue: { number: 131 },
      },
      request,
      catalogData: { vocabulary: { frontends: [] }, projects: [] },
      writeOutput,
    }),
  ).rejects.toThrow("Project submission issue is not open and admitted.");
  expect(writeOutput).not.toHaveBeenCalled();
});

test("rechecks Kit eligibility before applying triage mutations", async () => {
  const request = vi.fn(async (path: string) => {
    if (path === "/repos/Tavernary/Tavernary/issues/130") {
      return {
        number: 130,
        title: "[Kit submission]: Example",
        state: "closed",
        labels: ["issue-admitted"],
      };
    }
    throw new Error(`Unexpected mutation: ${path}`);
  });

  await expect(
    synchronizeKitSubmission(
      "Tavernary/Tavernary",
      130,
      {
        valid: true,
        manifest: null,
        errors: [],
        warnings: [],
        labels: ["kit-submission-valid"],
      },
      request,
    ),
  ).rejects.toThrow("Kit submission issue is not open and admitted.");
  expect(request).toHaveBeenCalledTimes(1);
});

test("Kit synchronization tolerates a concurrently removed owned label", async () => {
  const request = vi.fn(async (path: string, options = {}) => {
    if (path === "/repos/Tavernary/Tavernary/issues/132") {
      return {
        number: 132,
        title: "[Kit submission]: Example",
        state: "open",
        labels: [
          "issue-admitted",
          "kit-submission",
          "needs-information",
          "needs-maintainer-review",
        ],
      };
    }
    if (path.endsWith("/labels/needs-information")) {
      throw Object.assign(new Error("Label no longer exists."), {
        status: 404,
      });
    }
    if (path.endsWith("/comments?per_page=100")) return [];
    return {};
  });

  await expect(
    synchronizeKitSubmission(
      "Tavernary/Tavernary",
      132,
      {
        valid: true,
        manifest: null,
        errors: [],
        warnings: [],
        labels: ["kit-publication-ready"],
      },
      request,
    ),
  ).resolves.toBeUndefined();
  expect(request).toHaveBeenCalledWith(
    "/repos/Tavernary/Tavernary/issues/132/labels",
    {
      method: "POST",
      body: JSON.stringify({ labels: ["kit-publication-ready"] }),
    },
  );
  expect(request).toHaveBeenCalledWith(
    "/repos/Tavernary/Tavernary/issues/132/labels/needs-maintainer-review",
    { method: "DELETE" },
  );
});

test("resolves a workflow-dispatch project issue context", () => {
  expect(
    resolveProjectSubmissionEvent(
      { inputs: { issue_number: 21 } },
      {
        GITHUB_REPOSITORY: "MentallyQuill/Tavernary",
        ISSUE_NUMBER: "21",
      },
    ),
  ).toMatchObject({
    repository: { full_name: "MentallyQuill/Tavernary" },
    issue: { number: 21 },
  });
});

test("resolves a workflow-dispatch Kit issue context", async () => {
  const request = vi.fn().mockResolvedValue({
    number: 20,
    title: "[Kit submission]: Example",
    body: "### Kit manifest",
  });
  await expect(
    resolveKitSubmissionEvent(
      { inputs: { issue_number: 20 } },
      {
        GITHUB_REPOSITORY: "MentallyQuill/Tavernary",
        ISSUE_NUMBER: "20",
      },
      request,
    ),
  ).resolves.toMatchObject({
    repository: { full_name: "MentallyQuill/Tavernary" },
    issue: {
      number: 20,
      title: "[Kit submission]: Example",
      body: "### Kit manifest",
    },
  });
  expect(request).toHaveBeenCalledWith(
    "/repos/MentallyQuill/Tavernary/issues/20",
  );
});

test.each([
  {
    name: "closed",
    issue: {
      title: "[Project submission]",
      state: "closed",
      labels: ["issue-admitted"],
    },
  },
  {
    name: "unadmitted",
    issue: {
      title: "[Project submission]",
      state: "open",
      labels: [],
    },
  },
  {
    name: "wrong-kind",
    issue: {
      title: "[Kit submission]: Example",
      state: "open",
      labels: ["issue-admitted"],
    },
  },
])("rejects $name workflow-dispatch project issues", async ({ issue }) => {
  const request = vi.fn(async (path: string) => {
    if (path === "/repos/Tavernary/Tavernary/issues/21") {
      return {
        number: 21,
        body: "",
        ...issue,
      };
    }
    throw new Error(`Unexpected request: ${path}`);
  });

  await expect(
    processProjectSubmissionTriage({
      event: {
        repository: { full_name: "Tavernary/Tavernary" },
        issue: {
          number: 21,
          title: "",
          body: "",
          labels: [],
          state: "",
        },
      },
      request,
      catalogData: {
        vocabulary: { frontends: [] },
        projects: [],
      },
    }),
  ).rejects.toThrow("Project submission issue is not open and admitted.");
  expect(request).toHaveBeenCalledTimes(1);
});

test.each([
  {
    title: "[Kit submission]: Example",
    state: "closed",
    labels: ["issue-admitted", "kit-submission"],
  },
  {
    title: "[Kit submission]: Example",
    state: "open",
    labels: ["kit-submission"],
  },
  {
    title: "[Project submission] owner/repo",
    state: "open",
    labels: ["issue-admitted", "project-submission"],
  },
])("rejects ineligible workflow-dispatch Kit issues", (issue) => {
  expect(() => assertKitSubmissionEligible(issue)).toThrow(
    "Kit submission issue is not open and admitted.",
  );
});

test("accepts an admitted Kit submission after its title is edited", () => {
  expect(() =>
    assertKitSubmissionEligible({
      state: "open",
      labels: ["issue-admitted", "kit-submission"],
    }),
  ).not.toThrow();
});

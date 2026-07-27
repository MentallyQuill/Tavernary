import { expect, test } from "vitest";

import {
  buildEnrichmentIssueNotice,
  enrichmentIssueCliOptions,
  runEnrichmentIssueCli,
  syncEnrichmentIssue,
} from "../../scripts/catalog/enrichment-issue.mjs";

const runUrl = "https://github.com/MentallyQuill/Tavernary/actions/runs/123";
const runAt = "2026-07-27T18:00:00.000Z";

test("builds one issue notice from terminal unresolved projects", () => {
  const notice = buildEnrichmentIssueNotice({
    rolloutResult: { status: "complete-with-errors" },
    report: {
      status: "complete-with-errors",
      entries: {
        "project-a": {
          id: "project-a",
          outcome: "final-failure",
          reason_code: "provider-timeout",
          message: "The enrichment provider timed out after 120 seconds.",
        },
      },
      manual_exclusions: [],
    },
    runUrl,
    runAt,
  });

  expect(notice).toMatchObject({
    title: "Catalog enrichment errors",
    label: "catalog-enrichment-errors",
    marker: "<!-- tavernary:catalog-enrichment-errors -->",
    unresolved: [
      {
        id: "project-a",
        outcome: "final-failure",
        reasonCode: "provider-timeout",
      },
    ],
  });
  expect(notice.body).toContain(`[GitHub Actions run](${runUrl})`);
  expect(notice.body).toContain(
    "| project-a | final-failure | provider-timeout | The enrichment provider timed out after 120 seconds. |",
  );
});

test("sanitizes issue details and ignores untrusted report fields", () => {
  const notice = buildEnrichmentIssueNotice({
    rolloutResult: { status: "complete-with-errors" },
    report: {
      status: "complete-with-errors",
      entries: {
        "project-a": {
          id: "project-a",
          outcome: "final-failure",
          reason_code: "output-invalid",
          message: "Alert @maintainer|line\n<script>bad</script>",
          repair_hint: "SECRET REPAIR",
          provider: { raw: "SECRET PROVIDER" },
          readme_text: "SECRET README",
        },
      },
      manual_exclusions: [],
    },
    runUrl,
    runAt,
  });

  expect(notice.body).toContain("Alert @\u200bmaintainer\\|line bad");
  expect(notice.body).not.toMatch(
    /<script>|<\/script>|SECRET REPAIR|SECRET PROVIDER|SECRET README/u,
  );
});

test("rejects a non-terminal report for a partial rollout result", () => {
  expect(() =>
    buildEnrichmentIssueNotice({
      rolloutResult: { status: "complete-with-errors" },
      report: {
        status: "running",
        entries: {},
        manual_exclusions: [],
      },
      runUrl,
      runAt,
    }),
  ).toThrow("complete-with-errors rollout requires a matching terminal report");
});

test("builds controlled warning annotations for unresolved projects", () => {
  const notice = buildEnrichmentIssueNotice({
    rolloutResult: { status: "complete-with-errors" },
    report: {
      status: "complete-with-errors",
      entries: {
        "project-a": {
          id: "project-a",
          outcome: "source-not-ready",
          reason_code: "unhealthy-source",
          message: "Source is not ready.",
        },
      },
      manual_exclusions: [],
    },
    runUrl,
    runAt,
  });

  expect(notice.annotations).toEqual([
    "::warning title=Catalog enrichment unresolved::project-a remained provisional (unhealthy-source).",
  ]);
});

test("creates the rolling issue when unresolved projects first appear", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const runCommand = async (command: string, args: string[]) => {
    calls.push({ command, args });
    return {
      stdout: args[0] === "issue" && args[1] === "list" ? "[]" : "",
      stderr: "",
      exitCode: 0,
    };
  };
  const writeFile = async (_path: string, _content: string) => {};
  const notice = buildEnrichmentIssueNotice({
    rolloutResult: { status: "complete-with-errors" },
    report: {
      status: "complete-with-errors",
      entries: {
        "project-a": {
          id: "project-a",
          outcome: "final-failure",
          reason_code: "provider-timeout",
          message: "The provider timed out.",
        },
      },
      manual_exclusions: [],
    },
    runUrl,
    runAt,
  });

  await syncEnrichmentIssue({
    notice,
    repository: "MentallyQuill/Tavernary",
    bodyPath: "C:/tmp/catalog-enrichment-errors.md",
    runCommand,
    writeFile,
    runUrl,
  });

  expect(calls).toEqual([
    {
      command: "gh",
      args: [
        "label",
        "create",
        "catalog-enrichment-errors",
        "--repo",
        "MentallyQuill/Tavernary",
        "--color",
        "b60205",
        "--description",
        "Automatic catalog enrichment has unresolved projects.",
        "--force",
      ],
    },
    {
      command: "gh",
      args: [
        "issue",
        "list",
        "--repo",
        "MentallyQuill/Tavernary",
        "--state",
        "all",
        "--label",
        "catalog-enrichment-errors",
        "--limit",
        "100",
        "--json",
        "number,title,state,body",
      ],
    },
    {
      command: "gh",
      args: [
        "issue",
        "create",
        "--repo",
        "MentallyQuill/Tavernary",
        "--title",
        "Catalog enrichment errors",
        "--label",
        "catalog-enrichment-errors",
        "--body-file",
        "C:/tmp/catalog-enrichment-errors.md",
      ],
    },
  ]);
});

test("updates an existing open rolling issue", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const writes: Array<{ path: string; content: string }> = [];
  const notice = buildEnrichmentIssueNotice({
    rolloutResult: { status: "complete-with-errors" },
    report: {
      status: "complete-with-errors",
      entries: {
        "project-a": {
          id: "project-a",
          outcome: "final-failure",
          reason_code: "provider-timeout",
          message: "The provider timed out.",
        },
      },
      manual_exclusions: [],
    },
    runUrl,
    runAt,
  });

  await syncEnrichmentIssue({
    notice,
    repository: "MentallyQuill/Tavernary",
    bodyPath: "C:/tmp/catalog-enrichment-errors.md",
    async runCommand(command: string, args: string[]) {
      calls.push({ command, args });
      return {
        stdout:
          args[0] === "issue" && args[1] === "list"
            ? JSON.stringify([
                {
                  number: 42,
                  title: "Catalog enrichment errors",
                  state: "OPEN",
                  body: "<!-- tavernary:catalog-enrichment-errors -->",
                },
              ])
            : "",
        stderr: "",
        exitCode: 0,
      };
    },
    async writeFile(path: string, content: string) {
      writes.push({ path, content });
    },
    runUrl,
  });

  expect(writes).toEqual([
    {
      path: "C:/tmp/catalog-enrichment-errors.md",
      content: notice.body,
    },
  ]);
  expect(calls.at(-1)).toEqual({
    command: "gh",
    args: [
      "issue",
      "edit",
      "42",
      "--repo",
      "MentallyQuill/Tavernary",
      "--title",
      "Catalog enrichment errors",
      "--add-label",
      "catalog-enrichment-errors",
      "--body-file",
      "C:/tmp/catalog-enrichment-errors.md",
    ],
  });
});

test("reopens a closed rolling issue before updating it", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const notice = buildEnrichmentIssueNotice({
    rolloutResult: { status: "complete-with-errors" },
    report: {
      status: "complete-with-errors",
      entries: {
        "project-a": {
          id: "project-a",
          outcome: "final-failure",
          reason_code: "provider-timeout",
          message: "The provider timed out.",
        },
      },
      manual_exclusions: [],
    },
    runUrl,
    runAt,
  });

  await syncEnrichmentIssue({
    notice,
    repository: "MentallyQuill/Tavernary",
    bodyPath: "C:/tmp/catalog-enrichment-errors.md",
    async runCommand(command: string, args: string[]) {
      calls.push({ command, args });
      return {
        stdout:
          args[0] === "issue" && args[1] === "list"
            ? JSON.stringify([
                {
                  number: 42,
                  title: "Catalog enrichment errors",
                  state: "CLOSED",
                  body: "<!-- tavernary:catalog-enrichment-errors -->",
                },
              ])
            : "",
        stderr: "",
        exitCode: 0,
      };
    },
    async writeFile() {},
    runUrl,
  });

  expect(calls.slice(-2)).toEqual([
    {
      command: "gh",
      args: ["issue", "reopen", "42", "--repo", "MentallyQuill/Tavernary"],
    },
    expect.objectContaining({
      command: "gh",
      args: expect.arrayContaining(["issue", "edit", "42"]),
    }),
  ]);
});

test("closes an open rolling issue after a clean completed run", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const notice = buildEnrichmentIssueNotice({
    rolloutResult: { status: "complete" },
    report: null,
    runUrl,
    runAt,
  });

  await syncEnrichmentIssue({
    notice,
    repository: "MentallyQuill/Tavernary",
    bodyPath: "C:/tmp/catalog-enrichment-errors.md",
    async runCommand(command: string, args: string[]) {
      calls.push({ command, args });
      return {
        stdout:
          args[0] === "issue" && args[1] === "list"
            ? JSON.stringify([
                {
                  number: 42,
                  title: "Catalog enrichment errors",
                  state: "OPEN",
                  body: "<!-- tavernary:catalog-enrichment-errors -->",
                },
              ])
            : "",
        stderr: "",
        exitCode: 0,
      };
    },
    async writeFile() {},
    runUrl,
  });

  expect(calls.at(-1)).toEqual({
    command: "gh",
    args: [
      "issue",
      "close",
      "42",
      "--repo",
      "MentallyQuill/Tavernary",
      "--reason",
      "completed",
      "--comment",
      `Resolved by ${runUrl}.`,
    ],
  });
});

test("CLI emits controlled warnings and synchronizes the terminal report", async () => {
  const output: string[] = [];
  const result = await runEnrichmentIssueCli({
    resultPath: "C:/runner/enrichment-rollout-result.json",
    reportPath: "data/reports/enrichment-report.json",
    environment: {
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_REPOSITORY: "MentallyQuill/Tavernary",
      GITHUB_RUN_ID: "123",
      RUNNER_TEMP: "C:/runner",
    },
    async readJson(path: string) {
      if (path.endsWith("enrichment-rollout-result.json")) {
        return { status: "complete-with-errors" };
      }
      return {
        status: "complete-with-errors",
        entries: {
          "project-a": {
            id: "project-a",
            outcome: "final-failure",
            reason_code: "provider-timeout",
            message: "The provider timed out.",
          },
        },
        manual_exclusions: [],
      };
    },
    validateReport: (report) =>
      report as {
        status: string;
        entries: Record<string, Record<string, unknown>>;
        manual_exclusions: never[];
      },
    async runCommand(_command: string, args: string[]) {
      return {
        stdout: args[0] === "issue" && args[1] === "list" ? "[]" : "",
        stderr: "",
        exitCode: 0,
      };
    },
    async writeFile() {},
    writeOutput(value: string) {
      output.push(value);
    },
    now: "2026-07-27T18:00:00.000Z",
  });

  expect(result).toEqual({
    status: "complete-with-errors",
    unresolved: 1,
  });
  expect(output).toEqual([
    "::warning title=Catalog enrichment unresolved::project-a remained provisional (provider-timeout).",
  ]);
});

test("CLI rejects an invalid durable report before GitHub synchronization", async () => {
  await expect(
    runEnrichmentIssueCli({
      resultPath: "C:/runner/enrichment-rollout-result.json",
      reportPath: "data/reports/enrichment-report.json",
      environment: {
        GITHUB_SERVER_URL: "https://github.com",
        GITHUB_REPOSITORY: "MentallyQuill/Tavernary",
        GITHUB_RUN_ID: "123",
        RUNNER_TEMP: "C:/runner",
      },
      async readJson(path: string) {
        return path.endsWith("enrichment-rollout-result.json")
          ? { status: "complete-with-errors" }
          : {
              status: "complete-with-errors",
              entries: {},
              manual_exclusions: [],
            };
      },
      async runCommand() {
        return { stdout: "[]", stderr: "", exitCode: 0 };
      },
      async writeFile() {},
      writeOutput() {},
      now: "2026-07-27T18:00:00.000Z",
    }),
  ).rejects.toThrow("enrichment report schema is invalid");
});

test("CLI options require explicit result and report paths", () => {
  expect(
    enrichmentIssueCliOptions([
      "--result-path",
      "C:/runner/result.json",
      "--report-path",
      "data/reports/enrichment-report.json",
    ]),
  ).toEqual({
    resultPath: "C:/runner/result.json",
    reportPath: "data/reports/enrichment-report.json",
  });
  expect(() => enrichmentIssueCliOptions([])).toThrow(
    "--result-path and --report-path are required",
  );
});

test("rejects multiple marker-backed rolling issues", async () => {
  const notice = buildEnrichmentIssueNotice({
    rolloutResult: { status: "complete" },
    report: null,
    runUrl,
    runAt,
  });

  await expect(
    syncEnrichmentIssue({
      notice,
      repository: "MentallyQuill/Tavernary",
      bodyPath: "C:/tmp/catalog-enrichment-errors.md",
      async runCommand(_command: string, args: string[]) {
        const issue = {
          title: "Catalog enrichment errors",
          state: "OPEN",
          body: "<!-- tavernary:catalog-enrichment-errors -->",
        };
        return {
          stdout:
            args[0] === "issue" && args[1] === "list"
              ? JSON.stringify([
                  { ...issue, number: 41 },
                  { ...issue, number: 42 },
                ])
              : "",
          stderr: "",
          exitCode: 0,
        };
      },
      async writeFile() {},
      runUrl,
    }),
  ).rejects.toThrow("multiple rolling catalog enrichment issues exist");
});

test("reports GitHub CLI failures without exposing stderr", async () => {
  const notice = buildEnrichmentIssueNotice({
    rolloutResult: { status: "complete" },
    report: null,
    runUrl,
    runAt,
  });

  const error = await syncEnrichmentIssue({
    notice,
    repository: "MentallyQuill/Tavernary",
    bodyPath: "C:/tmp/catalog-enrichment-errors.md",
    async runCommand() {
      return {
        stdout: "",
        stderr: "Authorization: Bearer secret-token",
        exitCode: 2,
      };
    },
    async writeFile() {},
    runUrl,
  }).catch((reason) => reason);

  expect(error).toMatchObject({
    message: "gh label create failed with exit code 2",
  });
  expect(error.message).not.toContain("secret-token");
});

import { expect, test, vi } from "vitest";
import {
  projectInventoryFixture,
  metadataMaintenanceFixture,
} from "../helpers/automation-fixtures";
import {
  inspectProjectRetry,
  inspectProjectRetries,
} from "../../scripts/automation/project-retries.mjs";
import { discoverProjectOperations } from "../../scripts/automation/project-operations.mjs";
import { renderRedditRetryState } from "../../scripts/submissions/project-submission-retry-state.mjs";
import { runModelWriterPreparation } from "../../scripts/automation/writer-runtime.mjs";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { assessInventoryHealth } from "../../scripts/automation/health.mjs";

test("failed retry inspection raises a private-data-free incident and requires complete positive inspection to recover", async () => {
  const { state } = await metadataMaintenanceFixture();
  state.local.projectRetryInspectionFailures = 2;
  state.local.projectRetryInspectionComplete = false;
  expect(assessInventoryHealth(state)).toContainEqual(
    expect.objectContaining({
      code: "unknown-failure",
      subject: "dependency:publisher",
      status: "active",
      count: 2,
    }),
  );
  state.local.projectRetryInspectionFailures = 0;
  expect(
    assessInventoryHealth(state).some(
      (finding) =>
        finding.code === "unknown-failure" &&
        finding.subject === "dependency:publisher",
    ),
  ).toBe(false);
  state.local.projectRetryInspectionComplete = true;
  expect(assessInventoryHealth(state)).toContainEqual(
    expect.objectContaining({
      code: "unknown-failure",
      subject: "dependency:publisher",
      status: "recovered",
      count: 0,
    }),
  );
});

test.each([
  "retry-fork-dependencies",
  "retry-frontend-dependencies",
  "retry-project-submission-enrichment",
])(
  "%s wakes the shared writer without running a second privileged scanner",
  (name) => {
    const workflow = parse(
      readFileSync(`.github/workflows/${name}.yml`, "utf8"),
    );
    expect(workflow.permissions.actions).toBe("read");
    expect(workflow.jobs.retry["timeout-minutes"]).toBe(5);
    expect(workflow.jobs.retry.environment).toBe("publisher");
    expect(
      workflow.jobs.retry.steps.find(
        (step: { id?: string }) => step.id === "dispatch-token",
      ).with["permission-actions"],
    ).toBe("write");
    expect(workflow.jobs.retry.steps.at(-1).run).toContain(
      "automation-writer.yml",
    );
    expect(workflow.jobs.retry.steps.at(-1).run).toContain("-f mode=reconcile");
    expect(JSON.stringify(workflow.jobs.retry)).not.toContain(
      "scripts/submissions/retry-",
    );
  },
);

function fixture() {
  const p = projectInventoryFixture();
  p.issues[0].labels.push("waiting-on-fork-parent");
  const comment = {
    id: 1,
    user: { id: p.publisherActorId, type: "Bot" },
    body: `<!-- tavernary-project-submission-state\n${JSON.stringify({ schema_version: 1, generated_title: "[Project submission] Owner/Repo", status: "waiting-on-fork-parent", source_repository_id: 42, fork_dependency: { repository_id: 41, name: "Parent", repository: "Owner/Parent", canonical_url: "https://github.com/Owner/Parent", issue_number: 201 } })}\n-->`,
  };
  const state = {
    repository: "MentallyQuill/Tavernary",
    publisherActorId: p.publisherActorId,
    nowMs: p.nowMs,
    remote: { issues: p.issues, runs: p.runs },
    local: { projects: p.catalog.projects, sources: p.catalog.sources },
  };
  return { p, comment, state };
}
test("comment overflow stops at the page budget and reports the affected public issue without exposing comment text", async () => {
  const f = fixture();
  const gh = vi.fn(async () =>
    JSON.stringify(
      Array.from({ length: 100 }, (_, id) => ({
        id,
        body: "Private diagnostic must not be logged",
        user: { id: 1, type: "User" },
      })),
    ),
  );
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    expect(await inspectProjectRetries({ state: f.state, gh })).toMatchObject({
      failures: 1,
      inspectionComplete: true,
    });
    expect(gh).toHaveBeenCalledTimes(10);
    expect(warning).toHaveBeenCalledWith(
      "Project #42 retry inspection unavailable (unclassified-failure).",
    );
  } finally {
    warning.mockRestore();
  }
});
test("a fork wait stays out of automatic generation until positive dependency proof permits fresh triage", async () => {
  const f = fixture();
  expect(discoverProjectOperations(f.p)).toEqual([]);
  f.state.local.sources.push({
    schema_version: 1,
    type: "github",
    status: "active",
    status_reason: null,
    refresh_policy: "automatic",
    id: "github-41",
    repository: "Owner/Parent",
    repository_id: 41,
  });
  const gh = vi.fn(async () => JSON.stringify([f.comment]));
  expect(
    await inspectProjectRetry({ state: f.state, issue: f.p.issues[0], gh }),
  ).toEqual({ resolved: true, notBefore: null });
  expect(
    discoverProjectOperations({
      ...f.p,
      resolvedDependencies: new Set([42]),
    })[0],
  ).toMatchObject({ stage: "admitted", workerRunId: null });
  f.p.issues[0].labels.push("submission-declined");
  expect(
    discoverProjectOperations({ ...f.p, resolvedDependencies: new Set([42]) }),
  ).toEqual([]);
});
test.each(["open", "closed", "foreign", "missing"])(
  "fork parent closure uses current native %s evidence",
  async (variant) => {
    const f = fixture();
    if (variant === "foreign") f.comment.user.id = 1;
    const gh = vi.fn(async (args: string[]) => {
      if (args[1].includes("comments")) return JSON.stringify([f.comment]);
      if (variant === "missing")
        throw Object.assign(new Error("Not found"), { status: 404 });
      return JSON.stringify({
        number: 201,
        state: variant === "closed" ? "closed" : "open",
        labels: ["project-submission"],
      });
    });
    expect(
      await inspectProjectRetry({ state: f.state, issue: f.p.issues[0], gh }),
    ).toEqual({ resolved: variant === "closed", notBefore: null });
  },
);
test("frontend waits resolve by the registered frontend identity with numeric bot custody", async () => {
  const f = fixture();
  f.p.issues[0].labels = [
    "issue-admitted",
    "project-submission",
    "needs-information",
  ];
  f.comment.body = `<!-- tavernary-project-submission-state\n${JSON.stringify({ schema_version: 1, generated_title: "[Project submission] Owner/Repo", status: "needs-information", frontend_dependencies: [{ name: "Demo", canonical_url: "https://github.com/Owner/Repo" }] })}\n-->`;
  Object.assign(f.state.local.projects[0], { kind: "frontend" });
  const gh = vi.fn(async () => JSON.stringify([f.comment]));
  expect(
    await inspectProjectRetry({ state: f.state, issue: f.p.issues[0], gh }),
  ).toMatchObject({ resolved: true });
  f.comment.user.id = 1;
  expect(
    await inspectProjectRetry({ state: f.state, issue: f.p.issues[0], gh }),
  ).toMatchObject({ resolved: false });
});
test.each(["in_progress", "failure", "success"])(
  "native %s triage cannot hot-loop a resolved wait",
  async (status) => {
    const f = fixture();
    f.state.local.sources.push({
      schema_version: 1,
      type: "github",
      status: "active",
      status_reason: null,
      refresh_policy: "automatic",
      id: "github-41",
      repository: "Owner/Parent",
      repository_id: 41,
    });
    const run = {
      id: 700,
      path: ".github/workflows/triage-submission.yml",
      event: "workflow_dispatch",
      head_branch: "main",
      head_sha: "b".repeat(40),
      head_repository: { full_name: f.state.repository },
      actor: { id: f.state.publisherActorId, type: "Bot" },
      display_title: "Project #42: Validate submission",
      status: status === "in_progress" ? status : "completed",
      conclusion: status === "in_progress" ? null : status,
      updated_at: new Date(f.state.nowMs - 60000).toISOString(),
    };
    f.state.remote.runs.push(run as never);
    expect(
      await inspectProjectRetry({
        state: f.state,
        issue: f.p.issues[0],
        gh: async () => JSON.stringify([f.comment]),
      }),
    ).toMatchObject({ resolved: false });
  },
);
test("a trusted pending Reddit wave delays the normal controller and budget reservation, ignoring forged timing", async () => {
  const f = fixture();
  f.p.issues[0].labels = [
    "issue-admitted",
    "project-submission",
    "submission-retryable",
  ];
  f.p.issues[0].body = `### Project manifest\n\n\`\`\`json\n${JSON.stringify({ schema_version: 4, project_type: "preset", primary_function: "preset", source_url: "https://www.reddit.com/r/SillyTavernAI/comments/abc123/demo/", frontends: { known_ids: ["sillytavern"], other: [] }, frontend_independent: false, additional_context: null, metadata: { summary: { mode: "automatic" }, tags: { mode: "automatic" } }, preset_compatibility: { model_families: { known_ids: ["model-agnostic"], other: [] }, completion_formats: ["chat-completion"] } })}\n\`\`\``;
  const notBefore = new Date(f.state.nowMs + 86400000).toISOString();
  f.comment.body = `<!-- tavernary-project-generation-failure:project-submission -->\n${renderRedditRetryState({ schema_version: 1, issue_number: 42, source_identity: "reddit:abc123", completed_waves: 1, next_eligible_retry_at: notBefore, last_reason_code: "reddit-rate-limited", updated_at: new Date(f.state.nowMs).toISOString(), outcome: "pending" })}`;
  const gh = vi.fn(async () => JSON.stringify([f.comment]));
  expect(
    await inspectProjectRetry({ state: f.state, issue: f.p.issues[0], gh }),
  ).toMatchObject({ notBefore });
  const { state } = await metadataMaintenanceFixture();
  Object.assign(state, {
    publisherActorId: f.state.publisherActorId,
    nowMs: f.state.nowMs,
    operations: discoverProjectOperations(f.p),
  });
  Object.assign(state.remote, { issues: f.p.issues, pulls: [], runs: [] });
  const commit = vi.fn(async () => {
    throw new Error(
      "Unexpected budget reservation before the Reddit wave is due",
    );
  });
  const dispatch = vi.fn(async () => ({
    runId: 700,
    workflow: ".github/workflows/generate-project-submission.yml",
  }));
  await expect(
    runModelWriterPreparation({
      operationKey: state.operations[0].key,
      load: async () => state,
      gh,
      commit,
      dispatch,
      persistFailure: vi.fn(async () => {}),
      env: {
        GITHUB_REPOSITORY: state.repository,
        GITHUB_REF: "refs/heads/main",
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_ACTOR_ID: "2625904",
        GITHUB_WORKFLOW_REF: `${state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
        GITHUB_RUN_ID: "810",
        GITHUB_RUN_ATTEMPT: "1",
        TAVERNARY_PUBLISHER_BOT_ID: String(state.publisherActorId),
        UTILITY_MODEL: "primary",
      },
    }),
  ).resolves.toMatchObject({ status: "superseded" });
  expect(commit).not.toHaveBeenCalled();
  expect(dispatch).not.toHaveBeenCalled();
  f.comment.user.id = 1;
  expect(
    await inspectProjectRetry({ state: f.state, issue: f.p.issues[0], gh }),
  ).toMatchObject({ notBefore: null });
});
test("bounded wait inspection rotates across old unresolved issues without dispatching or reading ordinary issues", async () => {
  const f = fixture();
  f.state.remote.issues = Array.from({ length: 21 }, (_, i) => ({
    ...f.p.issues[0],
    number: i + 1,
  }));
  const gh = vi.fn<(args: string[]) => Promise<string>>(async () =>
    JSON.stringify([]),
  );
  const a = await inspectProjectRetries({ state: f.state, gh, limit: 20 });
  const first = gh.mock.calls.map(([args]) => args[1]);
  expect(gh).toHaveBeenCalledTimes(20);
  f.state.nowMs += 1800000;
  gh.mockClear();
  await inspectProjectRetries({ state: f.state, gh, limit: 20 });
  expect(
    new Set([...first, ...gh.mock.calls.map(([args]) => args[1])]).size,
  ).toBe(21);
  expect(a.resolvedDependencies.size).toBe(0);
});

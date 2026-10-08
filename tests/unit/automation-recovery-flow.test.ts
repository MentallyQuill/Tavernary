import { expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGenerateProjectOwnerCli } from "../../scripts/help/generate-project-owner-request.mjs";
import { planProjectGenerationFailure } from "../../scripts/submissions/project-generation-failure.mjs";
import { reconcileProjectValidations } from "../../scripts/submissions/reconcile-project-validations.mjs";
import {
  createProjectPublicationTransaction,
  PROJECT_PUBLICATION_TRANSACTION_MARKER,
} from "../../scripts/publication/project-publication-transaction.mjs";

const repository = "MentallyQuill/Tavernary";
const head = "c".repeat(40);
const publisherId = 41_982_982;
const now = Date.parse("2026-08-23T12:00:00.000Z");

function fixture(race?: "actor" | "head") {
  const transaction = createProjectPublicationTransaction({
    schema_version: 2,
    operation: "create",
    producer: "project-submission",
    publication_mode: "automatic",
    issue_number: 620,
    project_ids: ["example-project"],
    source_id: "github-42",
    source_identity: {
      type: "github",
      canonical: "github:42",
      repository_id: 42,
    },
    actor: { id: 1, login: "submitter", type: "User" },
    authority_type: "community-submitter",
    input_digest: "a".repeat(64),
    input_fingerprints: { projects: {}, source: null },
    base_sha: "b".repeat(40),
    generated_head_sha: head,
    generated_paths: [
      "data/registry/projects/example-project.json",
      "data/registry/sources/github-42.json",
      "data/snapshots/github/github-42.json",
    ],
    policy_version: "2026-08-23",
    copy_result: null,
  });
  const pull = {
    number: 620,
    state: "open",
    user: { id: publisherId, type: "Bot" },
    head: {
      ref: "automation/project-submission-620",
      sha: head,
      repo: { full_name: repository },
    },
    base: { ref: "main", repo: { full_name: repository } },
    body: `${PROJECT_PUBLICATION_TRANSACTION_MARKER}\n${JSON.stringify(transaction)}\n-->`,
  };
  const issue = {
    number: 620,
    state: "open",
    user: { id: 1, login: "submitter", type: "User" },
    labels: ["issue-admitted", "project-submission"],
  };
  let repaired = false;
  let pullReads = 0;
  let publisherActive = false;
  let comment: unknown = null;
  const dispatches: string[] = [];
  const request = async (
    path: string,
    options?: { method?: string; body?: string },
  ) => {
    const url = new URL(path, "https://api.github.test");
    const route = url.pathname;
    if ((options?.method ?? "GET") !== "GET") {
      if (route.endsWith("/dispatches")) {
        dispatches.push(route);
        publisherActive = route.endsWith(
          "publish-project-transaction.yml/dispatches",
        );
      }
      if (route.endsWith("/comments"))
        comment = {
          id: 77,
          user: { id: publisherId },
          body: JSON.parse(options!.body!).body,
        };
      return null;
    }
    if (route === `/repos/${repository}`) return { default_branch: "main" };
    if (route.endsWith("/pulls")) return [pull];
    if (route.endsWith("/pulls/620")) {
      pullReads++;
      return race === "head" && pullReads >= 2
        ? { ...pull, head: { ...pull.head, sha: "d".repeat(40) } }
        : pull;
    }
    if (route.endsWith("/issues/620"))
      return race === "actor" && pullReads >= 2
        ? { ...issue, user: { ...issue.user, id: 2 } }
        : issue;
    if (route.includes("/users/")) return { id: publisherId };
    if (route.endsWith("/comments")) return comment ? [comment] : [];
    if (route.endsWith("/statuses")) return [];
    if (route.includes("/labels/"))
      return { color: "unknown", description: "old" };
    if (route.endsWith("ci.yml/runs"))
      return {
        workflow_runs: [
          {
            id: 101,
            run_attempt: 3,
            head_sha: head,
            head_branch: pull.head.ref,
            event: "workflow_dispatch",
            path: ".github/workflows/ci.yml",
            status: "completed",
            conclusion: repaired ? "success" : "failure",
            created_at: new Date(now).toISOString(),
            updated_at: new Date(now).toISOString(),
          },
        ],
      };
    if (route.endsWith("publish-project-transaction.yml/runs"))
      return {
        workflow_runs: publisherActive
          ? [
              {
                id: 102,
                event: "workflow_dispatch",
                path: ".github/workflows/publish-project-transaction.yml",
                display_title: "Project publication for validation #101",
                status: "in_progress",
                conclusion: null,
              },
            ]
          : [],
      };
    if (route.endsWith("/runs")) return { workflow_runs: [] };
    throw new Error(`Unexpected fixture route: ${path}`);
  };
  return {
    issue,
    dispatches,
    request,
    repair: () => {
      repaired = true;
    },
  };
}

test("owner CLI preserves a credential circuit diagnostic without provider messages", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-owner-diagnostic-"));
  const failureDiagnosticPath = join(root, "failure.json");
  const error = Object.assign(new Error("secret provider response"), {
    code: "provider-authentication-failed",
  });
  try {
    await expect(
      runGenerateProjectOwnerCli({
        issueNumber: 620,
        root: join(root, "output"),
        reportPath: join(root, "report.json"),
        validatedReportPath: null,
        hostRepository: repository,
        failureDiagnosticPath,
        request: async () => ({}),
        generate: async () => {
          throw error;
        },
      }),
    ).rejects.toBe(error);
    expect(JSON.parse(await readFile(failureDiagnosticPath, "utf8"))).toEqual({
      schema_version: 1,
      reason_code: "provider-authentication-failed",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a credential outage followed by repaired CI after 72 hours dispatches one Publisher", async () => {
  const state = fixture();
  const diagnostic = planProjectGenerationFailure({
    issue: state.issue,
    producer: "project-submission",
    ownedPull: null,
    runUrl: "https://github.com/MentallyQuill/Tavernary/actions/runs/100",
    reasonCode: "provider-authentication-failed",
    nowMs: now,
  });
  expect(diagnostic.failure?.kind).toBe("configuration");
  expect(Date.parse(diagnostic.nextEligibleAt!)).toBe(now + 86_400_000);
  const input = {
    repository,
    request: state.request,
    publisherActorId: publisherId,
  };
  expect(
    (await reconcileProjectValidations({ ...input, nowMs: now })).results[0],
  ).toMatchObject({
    action: "wait",
    retry: { action: "probe", incident: true },
  });
  state.repair();
  expect(
    (
      await reconcileProjectValidations({
        ...input,
        nowMs: now + 72 * 3_600_000,
      })
    ).results[0],
  ).toMatchObject({ action: "publish", outcome: "applied" });
  await reconcileProjectValidations({ ...input, nowMs: now + 72 * 3_600_000 });
  expect(state.dispatches).toHaveLength(1);
});

test.each(["actor", "head"] as const)(
  "changed %s after preparation prevents dispatch",
  async (race) => {
    const state = fixture(race);
    state.repair();
    expect(
      (
        await reconcileProjectValidations({
          repository,
          request: state.request,
          publisherActorId: publisherId,
          nowMs: now,
        })
      ).results[0],
    ).toMatchObject({ action: "ignore", outcome: "stale" });
    expect(state.dispatches).toHaveLength(0);
  },
);

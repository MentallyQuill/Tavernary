import { expect, test } from "vitest";
import {
  projectInventoryFixture,
  metadataMaintenanceFixture,
} from "../helpers/automation-fixtures";
import { discoverProjectOperations } from "../../scripts/automation/project-operations.mjs";
import { planDirectGeneration } from "../../scripts/automation/submission-routing.mjs";
import { reconcileSubmissionHandoffs } from "../../scripts/submissions/reconcile-project-validations.mjs";
import { reconcileProjectGenerationFailure } from "../../scripts/submissions/project-generation-failure.mjs";
import { parseProjectSubmissionIssue } from "../../scripts/submissions/parse-project-submission.mjs";
import {
  createProjectPublicationTransaction,
  fingerprintProjectPublicationInput,
  parseProjectPublicationTransaction,
  PROJECT_PUBLICATION_TRANSACTION_MARKER,
} from "../../scripts/publication/project-publication-transaction.mjs";

function strandedCopyReview() {
  const input = projectInventoryFixture({
    generatedPull: {},
    generationRun: null,
    publicationMode: "manual",
  });
  const issue = input.issues[0];
  issue.labels.push("submission-pr-open");
  issue.body = issue.body!.replace(
    '"summary":{"mode":"automatic"}',
    '"summary":{"mode":"manual","value":"Owner-authored summary."}',
  );
  const parsed = parseProjectSubmissionIssue(issue.body);
  if (!parsed.valid) throw new Error("Invalid recovery fixture");
  const pull = input.pulls[0];
  const transaction = createProjectPublicationTransaction({
    ...parseProjectPublicationTransaction(pull.body)!,
    input_digest: fingerprintProjectPublicationInput(parsed.manifest),
  });
  pull.body = [
    PROJECT_PUBLICATION_TRANSACTION_MARKER,
    JSON.stringify(transaction),
    "-->",
    "## Catalog-copy review",
    "",
    "Contextual catalog-copy review was unavailable, so the submitted owner wording was preserved with only catalog-required whitespace normalization.",
  ].join("\n");
  return input;
}

test("discovers the owned manual-copy fallback for regeneration instead of publication", () => {
  expect(discoverProjectOperations(strandedCopyReview())).toMatchObject([
    { stage: "admitted", expectedSha: "c".repeat(40), workerRunId: null },
  ]);
});

test("the direct generator retries the legacy copy review even on its original base", () => {
  expect(
    planDirectGeneration({
      ...strandedCopyReview(),
      currentRunId: 999,
      currentMainSha: "b".repeat(40),
    }),
  ).toEqual({ action: "generate" });
});

test("scheduled recovery regenerates a stranded copy review and rechecks it before dispatch", async () => {
  const input = strandedCopyReview();
  const { state } = await metadataMaintenanceFixture();
  Object.assign(state, {
    operations: discoverProjectOperations(input),
    nowMs: input.nowMs,
    local: { ...state.local, ...input.catalog },
    remote: { ...state.remote, issues: input.issues, pulls: input.pulls },
  });
  const dispatches: string[][] = [];
  let inspections = 0;
  const pass = () =>
    reconcileSubmissionHandoffs({
      repository: "MentallyQuill/Tavernary",
      gh: async (args) => {
        if (args[0] === "api") return JSON.stringify(input.issues);
        dispatches.push(args);
        return "";
      },
      load: async () => {
        inspections++;
        return state;
      },
      finalize: async () => {
        throw new Error("Recovery must regenerate before finalization");
      },
    });
  expect(await pass()).toMatchObject({ dispatched: 1 });
  expect(inspections).toBe(2);
  expect(dispatches).toEqual([
    [
      "workflow",
      "run",
      "generate-project-submission.yml",
      "--repo",
      "MentallyQuill/Tavernary",
      "--ref",
      "main",
      "-f",
      "issue_number=42",
    ],
  ]);
  state.operations[0].nextEligibleAt = new Date(
    input.nowMs + 60_000,
  ).toISOString();
  expect(await pass()).toMatchObject({ dispatched: 0 });
  expect(dispatches).toHaveLength(1);
});

test.each([
  "edited-head",
  "foreign-author",
  "foreign-branch",
  "declined",
  "changed-input",
  "ordinary-manual",
])("%s stays outside automatic copy-review recovery", (change) => {
  const input = strandedCopyReview();
  if (change === "edited-head") input.pulls[0].head.sha = "e".repeat(40);
  if (change === "foreign-author") input.pulls[0].user.id = 123;
  if (change === "foreign-branch") input.pulls[0].head.ref = "another-branch";
  if (change === "declined") input.issues[0].labels.push("submission-declined");
  if (change === "changed-input")
    input.issues[0].body = input.issues[0].body!.replace(
      "Owner-authored summary.",
      "Changed summary.",
    );
  if (change === "ordinary-manual")
    input.pulls[0].body = input.pulls[0].body.split(
      "## Catalog-copy review",
    )[0];
  if (change === "foreign-branch") {
    expect(discoverProjectOperations(input)).toMatchObject([
      { stage: "admitted", expectedSha: null },
    ]);
  } else expect(discoverProjectOperations(input)).toEqual([]);
});

test("a failed legacy review recovery saves its next retry on the original submission", async () => {
  const input = strandedCopyReview();
  const mutations: string[] = [];
  const plan = await reconcileProjectGenerationFailure({
    repository: "MentallyQuill/Tavernary",
    issueNumber: 42,
    producer: "project-submission",
    publisherActorId: input.publisherActorId,
    runUrl: "https://github.com/MentallyQuill/Tavernary/actions/runs/900",
    reasonCode: "provider-response-invalid",
    nowMs: input.nowMs,
    request: async (path, options) => {
      if (options) {
        mutations.push(path);
        return {};
      }
      if (path.endsWith("/issues/42")) return input.issues[0];
      if (path.includes("/pulls?")) return input.pulls;
      if (path.includes("/comments?")) return [];
      throw new Error(`Unexpected recovery request: ${path}`);
    },
  });
  expect(plan).toMatchObject({
    action: "reconcile",
    failure: { kind: "transient", reasonCode: "provider-response-invalid" },
    labels: ["project-submission", "issue-admitted", "submission-retryable"],
  });
  expect(Date.parse(plan.nextEligibleAt!)).toBeGreaterThan(input.nowMs);
  expect(mutations).toEqual([
    "/repos/MentallyQuill/Tavernary/issues/42/labels",
    "/repos/MentallyQuill/Tavernary/issues/42/comments",
  ]);
});

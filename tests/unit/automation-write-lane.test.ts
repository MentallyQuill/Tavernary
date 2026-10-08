import { expect, test } from "vitest";
import { createHash } from "node:crypto";
import { planCanonicalPublication } from "../../scripts/automation/write-lane.mjs";
import {
  operationFixture,
  preparedResultFixture,
  preparedResultContextFixture,
  projectInventoryFixture,
  writeLaneFixture,
} from "../helpers/automation-fixtures";
import { discoverProjectOperations } from "../../scripts/automation/project-operations.mjs";
import { parseProjectPublicationTransaction } from "../../scripts/publication/project-publication-transaction.mjs";

test("replayed results produce one canonical publication", () => {
  const candidate = preparedResultFixture();
  const plan = planCanonicalPublication(
    writeLaneFixture({ candidates: [candidate, candidate] }),
  );
  expect(plan.actions).toHaveLength(1);
  expect(plan.actions[0]).toMatchObject({
    action: "commit",
    operationKeys: [candidate.operationKey],
  });
});

test("already published replay recovers bookkeeping without another write", () => {
  const input = writeLaneFixture();
  input.operations[0].stage = "published";
  input.operations[0].expectedSha = input.currentMainSha;
  const plan = planCanonicalPublication(input);
  expect(plan.actions).toEqual([]);
  expect(plan.satisfied).toEqual([input.operations[0].key]);
});
test("authority and input races reject or regenerate without publication", () => {
  const input = writeLaneFixture();
  input.candidates[0].currentState.authorityValid = false;
  expect(planCanonicalPublication(input)).toMatchObject({
    actions: [],
    rejected: [{ reasonCode: "prepared-authority-lost" }],
  });
  input.candidates[0].currentState.authorityValid = true;
  input.candidates[0].currentState.inputDigest = "f".repeat(64);
  expect(planCanonicalPublication(input)).toMatchObject({
    actions: [],
    regenerate: [{ reasonCode: "prepared-input-stale" }],
  });
});
test("every claimant of a conflicting path waits for regeneration", () => {
  const input = writeLaneFixture();
  const initial = input.candidates[0];
  for (let index = 1; index <= 2; index++) {
    const candidate = {
      result: structuredClone(initial.result),
      run: structuredClone(initial.run),
      currentState: { ...initial.currentState },
    };
    candidate.result.inputDigest = (index === 1 ? "c" : "d").repeat(64);
    const operation = operationFixture({
      identity: {
        kind: "refresh",
        subject: "source:github-42",
        inputDigest: candidate.result.inputDigest,
        policyVersion: "1",
      },
    });
    candidate.result.operationKey = operation.key;
    candidate.currentState.inputDigest = candidate.result.inputDigest;
    if (index === 1) {
      candidate.result.files[0].content = JSON.stringify({
        source_id: "github-42",
        repository_id: 42,
        updated: true,
      });
      candidate.result.files[0].sha256 = createHash("sha256")
        .update(candidate.result.files[0].content)
        .digest("hex");
      candidate.result.files[0].bytes = Buffer.byteLength(
        candidate.result.files[0].content,
      );
    }
    input.candidates.push(candidate);
    input.operations.push(operation);
  }
  const plan = planCanonicalPublication(input);
  expect(plan.actions).toEqual([]);
  expect(plan.regenerate).toHaveLength(3);
});

function projectBatch() {
  const inventory = projectInventoryFixture({
    generatedPull: {},
    validationRun: {},
  });
  const operation = discoverProjectOperations(inventory)[0];
  const transaction = parseProjectPublicationTransaction(
    inventory.pulls[0].body,
  )!;
  const result = preparedResultFixture({
    paths: transaction.generated_paths,
    operationKey: operation.key,
    kind: "project",
    policyVersion: transaction.policy_version,
    inputDigest: operation.identity.inputDigest,
    authorId: transaction.actor.id,
    producer: {
      workflow: ".github/workflows/generate-project-submission.yml",
      runId: 700,
      sourceSha: transaction.base_sha,
    },
  });
  const context = preparedResultContextFixture();
  context.operation = operation;
  context.run.path = result.producer.workflow;
  context.currentState = {
    ...context.currentState,
    authorId: result.authorId,
    inputDigest: result.inputDigest,
    policyVersion: result.policyVersion,
    allowedPaths: result.files.map((file) => file.path),
    projectPublication: {
      enabled: true,
      repository: result.repository,
      defaultBranch: "main",
      transaction,
      pull: { ...inventory.pulls[0], mergeable: true },
      issue: {
        ...inventory.issues[0],
        labels: [...inventory.issues[0].labels, "submission-pr-open"],
      },
      changedPaths: transaction.generated_paths,
      workflowRun: {
        name: "Site: Validate changes",
        event: "workflow_dispatch",
        head_branch: inventory.pulls[0].head.ref,
        head_sha: transaction.generated_head_sha,
        conclusion: "success",
      },
      validatedFileDigests: Object.fromEntries(
        result.files.map((file) => [file.path, file.sha256]),
      ),
      current: {
        authorityValid: true,
        sourceIdentityValid: true,
        mainSha: transaction.base_sha,
        inputDigest: transaction.input_digest,
        projectFingerprints: {},
        sourceFingerprint: null,
        baseDriftSafe: false,
      },
    },
  };
  return {
    operations: [operation],
    candidates: [
      { result, run: context.run, currentState: context.currentState },
    ],
    currentMainSha: result.baseSha,
    expectedPublisherId: context.publisherActorId,
  };
}

test("project publication retains the existing exact-head and manual planner gates", () => {
  const input = projectBatch();
  expect(planCanonicalPublication(input).actions[0]).toMatchObject({
    action: "merge",
    expectedHeadSha: input.operations[0].expectedSha,
  });
  const context = input.candidates[0].currentState.projectPublication!;
  const transaction = context.transaction as {
    publication_mode: string;
    authority_type: string;
  };
  transaction.authority_type = "repository-owner";
  transaction.publication_mode = "manual";
  expect(planCanonicalPublication(input)).toMatchObject({
    actions: [],
    waiting: [{ reasonCode: "manual-approval-required" }],
  });
  transaction.publication_mode = "automatic";
  (context.pull as { head: { sha: string } }).head.sha = "f".repeat(40);
  expect(planCanonicalPublication(input)).toMatchObject({
    actions: [],
    regenerate: [{ reasonCode: "head-sha-stale" }],
  });
});
test.each([
  "actor",
  "source",
  "custody",
  "expected-head",
  "prepared-paths",
  "prepared-content",
])("project transaction cannot substitute prepared %s", (variant) => {
  const input = projectBatch();
  const context = input.candidates[0].currentState.projectPublication!;
  const transaction = context.transaction as {
    actor: { id: number };
    source_identity: { canonical: string };
  };
  if (variant === "actor") transaction.actor.id++;
  if (variant === "source")
    transaction.source_identity.canonical = "github:999";
  if (variant === "custody")
    (context.pull as { user: { id: number } }).user.id++;
  if (variant === "expected-head")
    input.operations[0].expectedSha = "f".repeat(40);
  if (variant === "prepared-paths") input.candidates[0].result.files.pop();
  if (variant === "prepared-content") {
    const file = input.candidates[0].result.files[0];
    file.content = JSON.stringify({
      source_id: "github-42",
      repository_id: 42,
      extra: true,
    });
    file.sha256 = createHash("sha256").update(file.content).digest("hex");
    file.bytes = Buffer.byteLength(file.content);
  }
  expect(planCanonicalPublication(input).actions).toEqual([]);
});

test("the writer rejects more than twenty unique candidate operations", () => {
  const input = writeLaneFixture();
  for (let index = 1; index <= 20; index++) {
    const result = structuredClone(input.candidates[0].result);
    const operation = operationFixture({
      identity: {
        kind: "refresh",
        subject: `source:github-${index + 42}`,
        inputDigest: result.inputDigest,
        policyVersion: result.policyVersion,
      },
    });
    result.operationKey = operation.key;
    input.operations.push(operation);
    input.candidates.push({ ...input.candidates[0], result });
  }
  expect(() => planCanonicalPublication(input)).toThrow();
});

test("a permanently rejected current input cannot be republished by artifact replay", () => {
  const input = writeLaneFixture();
  input.operations[0].retry = {
    failure: { kind: "permanent", reasonCode: "validation-failed" },
    immediateAttempts: 0,
    transientAttempts: 0,
  };
  expect(planCanonicalPublication(input)).toMatchObject({
    actions: [],
    rejected: [{ reasonCode: "operation-permanently-rejected" }],
  });
});
test("compatible independent snapshot results form one bounded canonical commit", () => {
  const input = writeLaneFixture();
  const first = input.candidates[0];
  const result = structuredClone(first.result);
  result.source = { id: "github-43", identity: "github:43" };
  result.files[0].path = "data/snapshots/github/github-43.json";
  result.files[0].content = JSON.stringify({
    source_id: "github-43",
    repository_id: 43,
  });
  result.files[0].sha256 = createHash("sha256")
    .update(result.files[0].content)
    .digest("hex");
  result.files[0].bytes = Buffer.byteLength(result.files[0].content);
  const operation = operationFixture({
    identity: {
      kind: "refresh",
      subject: "source:github-43",
      inputDigest: result.inputDigest,
      policyVersion: result.policyVersion,
    },
  });
  result.operationKey = operation.key;
  const currentState = {
    ...first.currentState,
    source: result.source,
    allowedPaths: [result.files[0].path],
    validateContent: (_path: string, value: unknown) =>
      (value as { repository_id: number }).repository_id === 43,
  };
  input.operations.push(operation);
  input.candidates.push({ result, run: first.run, currentState });
  const plan = planCanonicalPublication(input);
  expect(plan.actions).toHaveLength(1);
  expect(plan.actions[0]).toMatchObject({
    action: "commit",
    operationKeys: [first.result.operationKey, result.operationKey],
  });
  expect(
    plan.actions[0].action === "commit" && plan.actions[0].files,
  ).toHaveLength(2);
});

test("changed project authority or unsafe base drift retain the existing refusal", () => {
  const input = projectBatch();
  const context = input.candidates[0].currentState.projectPublication!;
  const current = context.current as {
    authorityValid: boolean;
    mainSha: string;
    baseDriftSafe: boolean;
  };
  current.authorityValid = false;
  expect(planCanonicalPublication(input)).toMatchObject({
    actions: [],
    rejected: [{ reasonCode: "authority-lost" }],
  });
  current.authorityValid = true;
  current.mainSha = "d".repeat(40);
  input.currentMainSha = current.mainSha;
  input.candidates[0].currentState.mainSha = current.mainSha;
  expect(planCanonicalPublication(input)).toMatchObject({
    actions: [],
    regenerate: [{ reasonCode: "base-behind-main" }],
  });
  current.baseDriftSafe = true;
  expect(planCanonicalPublication(input).actions[0]).toMatchObject({
    action: "merge",
    expectedMainSha: current.mainSha,
  });
});
test("different results for one operation cannot choose an arbitrary winner", () => {
  const input = writeLaneFixture();
  const candidate = {
    ...input.candidates[0],
    result: structuredClone(input.candidates[0].result),
  };
  candidate.result.producer.runId++;
  input.candidates.push(candidate);
  expect(planCanonicalPublication(input)).toMatchObject({
    actions: [],
    rejected: [{ reasonCode: "prepared-operation-conflict" }],
  });
});

import { expect, test } from "vitest";
import { discoverKitOperations } from "../../scripts/automation/kit-operations.mjs";
import {
  AUTOMATION_NOW,
  kitInventoryFixture,
  receiptFixture,
} from "../helpers/automation-fixtures";
import { validateAutomationOperation } from "../../scripts/automation/operation.mjs";

test("missing finalization is recovered without publishing twice", () => {
  const operations = discoverKitOperations(
    kitInventoryFixture({
      canonicalPublished: true,
      issueOpen: true,
      confirmedDeployment: true,
    }),
  );
  expect(operations.map((operation) => operation.stage)).toContain(
    "deployment-confirmed",
  );
  expect(operations.some((operation) => operation.stage === "validated")).toBe(
    false,
  );
});

test("missing admission, triage and publication each remain discoverable", () => {
  expect(
    discoverKitOperations(kitInventoryFixture({ admitted: false }))[0].stage,
  ).toBe("discovered");
  expect(
    discoverKitOperations(kitInventoryFixture({ ready: false }))[0].stage,
  ).toBe("admitted");
  expect(discoverKitOperations(kitInventoryFixture())[0].stage).toBe(
    "validated",
  );
});

test.each([
  "unknown-author",
  "blocked-author",
  "manual-review",
  "empty",
  "source-deleted",
  "closed",
])("%s cannot enter automatic publication", (condition) => {
  const input = kitInventoryFixture();
  if (condition === "unknown-author") input.issues[0].user.type = "Bot";
  if (condition === "blocked-author")
    input.blockedUsers = { blocked: [{ github_user_id: 1 }] };
  if (condition === "manual-review")
    input.issues[0].labels.push("needs-maintainer-review");
  if (condition === "empty")
    input.issues[0].body = input.issues[0].body.replace(
      '["frontend","extension-a","extension-b"]',
      "[]",
    );
  if (condition === "source-deleted")
    input.snapshotsBySourceId["github-2"] = {
      source_id: "github-2",
      source_health: "deleted",
    };
  if (condition === "closed") input.issues[0].state = "closed";
  expect(
    discoverKitOperations(input).some(
      (operation) => operation.stage === "validated",
    ),
  ).toBe(false);
});

test("Kit edits require the current author and revalidation of the current content", () => {
  const input = kitInventoryFixture({ operation: "edit" });
  input.issues[0].body = input.issues[0].body.replace(
    "A useful collection.",
    "An updated collection.",
  );
  const edited = discoverKitOperations(input)[0];
  expect(edited.stage).toBe("validated");
  input.issues[0].user.id = 123;
  expect(
    discoverKitOperations(input).some(
      (operation) => operation.stage === "validated",
    ),
  ).toBe(false);
});

test("lost withdrawal dispatch is recovered only for admitted confirmed author requests", () => {
  const input = kitInventoryFixture({ operation: "withdrawal" });
  expect(discoverKitOperations(input)[0]).toMatchObject({
    stage: "validated",
    identity: { kind: "withdrawal" },
  });
  input.issues[0].user.id = 123;
  expect(discoverKitOperations(input)).toEqual([]);
  const unadmitted = kitInventoryFixture({
    operation: "withdrawal",
    admitted: false,
  });
  expect(discoverKitOperations(unadmitted)[0].stage).toBe("discovered");
  const unconfirmed = kitInventoryFixture({ operation: "withdrawal" });
  unconfirmed.issues[0].body = unconfirmed.issues[0].body.replace(
    '"confirmation":true',
    '"confirmation":false',
  );
  expect(
    discoverKitOperations(unconfirmed).some(
      (operation) => operation.stage === "validated",
    ),
  ).toBe(false);
});

test("withdrawal tombstones recover deployment and cleanup without another withdrawal", () => {
  const input = kitInventoryFixture({
    operation: "withdrawal",
    confirmedDeployment: true,
  });
  input.kits[0].status = "withdrawn";
  expect(discoverKitOperations(input)[0]).toMatchObject({
    stage: "deployment-confirmed",
    expectedSha: "d".repeat(40),
  });
  expect(() =>
    validateAutomationOperation(discoverKitOperations(input)[0]),
  ).not.toThrow();
});

test("completed Kit issue bookkeeping is idempotent while deployment remains independently recoverable", () => {
  const input = kitInventoryFixture({
    canonicalPublished: true,
    issueOpen: false,
    confirmedDeployment: true,
  });
  input.issues[0].labels.push("kit-published");
  input.issues[0].state_reason = "completed";
  expect(discoverKitOperations(input)).toEqual([]);
  input.confirmedRevisions = [];
  expect(discoverKitOperations(input)[0].stage).toBe("published");
});

test("matching active trusted Kit workers suppress duplicate publication", () => {
  const input = kitInventoryFixture();
  input.runs = [
    {
      id: 700,
      path: ".github/workflows/apply-kit-submission.yml",
      event: "workflow_dispatch",
      display_title: "Kit #42: Publish approved Kit",
      actor: { id: input.publisherActorId, type: "Bot" },
      head_branch: "main",
      status: "in_progress",
      conclusion: null,
    },
  ];
  expect(discoverKitOperations(input)[0].workerRunId).toBe(700);
  input.runs[0].actor!.id = 123;
  expect(discoverKitOperations(input)[0].workerRunId).toBeNull();
});

test("a cancelled current-input publisher is retryable after a long outage without duplicate publication", () => {
  const input = kitInventoryFixture();
  const operation = discoverKitOperations(input)[0];
  input.runs = [
    {
      id: 700,
      path: ".github/workflows/apply-kit-submission.yml",
      event: "workflow_dispatch",
      display_title: "Kit #42: Publish approved Kit",
      actor: { id: input.publisherActorId, type: "Bot" },
      head_branch: "main",
      status: "completed",
      conclusion: "cancelled",
      created_at: new Date(AUTOMATION_NOW - 60_000).toISOString(),
      updated_at: new Date(AUTOMATION_NOW - 60_000).toISOString(),
    },
  ];
  input.receipts = [
    receiptFixture({ operation: { ...operation, workerRunId: 700 } }),
  ];
  const failed = discoverKitOperations(input)[0];
  expect(failed.retry?.failure.kind).toBe("transient");
  expect(Date.parse(failed.nextEligibleAt!)).toBeGreaterThan(input.nowMs);
  input.receipts = [receiptFixture({ operation: failed })];
  input.nowMs += 72 * 3_600_000;
  expect(discoverKitOperations(input)[0].nextEligibleAt).toBe(
    failed.nextEligibleAt,
  );
  input.issues[0].body = input.issues[0].body.replace(
    "A useful collection.",
    "Changed collection.",
  );
  expect(discoverKitOperations(input)[0]).toMatchObject({
    retry: null,
    nextEligibleAt: null,
  });
  input.kits = kitInventoryFixture({ canonicalPublished: true }).kits;
  expect(discoverKitOperations(input)[0]).toMatchObject({
    stage: "published",
    retry: null,
  });
});

test("Kit operation keys ignore insignificant whitespace in normalized text", () => {
  const input = kitInventoryFixture();
  const original = discoverKitOperations(input)[0];
  input.issues[0].body = input.issues[0].body.replace(
    '"title":"Example Kit"',
    '"title":"  Example Kit  "',
  );
  expect(discoverKitOperations(input)[0].key).toBe(original.key);
});

test("receipts cannot claim a Kit was published when the canonical record is absent", () => {
  const input = kitInventoryFixture();
  const operation = discoverKitOperations(input)[0];
  input.receipts = [
    receiptFixture({
      operation: {
        ...operation,
        stage: "published",
        expectedSha: "d".repeat(40),
      },
    }),
  ];
  expect(discoverKitOperations(input)[0].stage).toBe("validated");
});

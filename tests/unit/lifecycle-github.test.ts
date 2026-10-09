import { expect, test } from "vitest";
import { projectAutomationLifecycle } from "../../scripts/automation/lifecycle-github.mjs";
import { finalizeAutomationOperation } from "../../scripts/automation/finalization.mjs";
import type { AutomationReceipt } from "../../scripts/automation/receipts.mjs";
import {
  kitInventoryFixture,
  projectInventoryFixture,
  receiptFixture,
} from "../helpers/automation-fixtures";
import { discoverKitOperations } from "../../scripts/automation/kit-operations.mjs";
import { discoverProjectOperations } from "../../scripts/automation/project-operations.mjs";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
import { catalogInventoryFixture } from "../helpers/automation-fixtures";
import { discoverCatalogOperations } from "../../scripts/automation/catalog-operations.mjs";
import { createPolicyEvidenceFingerprint } from "../../scripts/moderation/catalog-policy-review-contract.mjs";
import {
  parseProjectPublicationTransaction,
  PROJECT_PUBLICATION_TRANSACTION_MARKER,
} from "../../scripts/publication/project-publication-transaction.mjs";

test.each(["project-submission", "project-owner-request"] as const)(
  "%s lifecycle closes only its unchanged merged input, updates numeric-owned comments and replays without effects",
  async (producer) => {
    const input = projectInventoryFixture({
      merged: true,
      confirmedDeployment: true,
      producer,
    });
    const operation = discoverProjectOperations(input)[0];
    const issue = {
      ...input.issues[0],
      labels: [...input.issues[0].labels, "human-label", "submission-pr-open"],
      state_reason: null as string | null,
    };
    if (producer === "project-owner-request") {
      const transaction = parseProjectPublicationTransaction(
        input.pulls[0].body,
      )!;
      transaction.copy_result = {
        mode: "preserve",
        result: "accepted-with-light-edits",
        change_reasons: ["punctuation-corrected"],
        policy_signal: "none",
      };
      input.pulls[0].body = `${PROJECT_PUBLICATION_TRANSACTION_MARKER}\n${JSON.stringify(transaction)}\n-->`;
    }
    const state = {
      root: process.cwd(),
      repository: "MentallyQuill/Tavernary",
      publisherActorId: input.publisherActorId,
      nowMs: input.nowMs,
      receipts: [],
      operations: [operation],
      remote: {
        issues: [issue],
        pulls: input.pulls,
        runs: [],
        mainHeadSha: operation.expectedSha,
      },
      local: { ...input.catalog, kits: [], revision: operation.expectedSha },
    } as AutomationInventoryState;
    const marker = "<!-- tavernary-project-validation-state";
    const foreign = {
      id: 9,
      body: `${marker}\n{}\n-->\nForeign`,
      user: { id: 99, type: "Bot" },
    };
    const comments = [
      foreign,
      {
        id: 10,
        body: `${marker}\n{"schema_version":1,"status":"validated","attempts":1}\n-->\nValidated`,
        user: { id: 41898282, type: "Bot" },
      },
    ];
    const writes: string[] = [];
    const gh = async (args: string[], stdin?: string) => {
      const path = args.find((v) => v.startsWith("repos/"))!;
      const method = args.includes("--method")
        ? args[args.indexOf("--method") + 1]
        : "GET";
      if (method === "GET") {
        if (path.endsWith("pulls/84")) return JSON.stringify(input.pulls[0]);
        if (path.endsWith("issues/42")) return JSON.stringify(issue);
        if (path.includes("/comments?")) return JSON.stringify(comments);
        throw new Error(`Unexpected read ${path}`);
      }
      writes.push(path);
      const payload = JSON.parse(stdin ?? "{}");
      if (path.includes("/labels/") && method === "DELETE")
        issue.labels = issue.labels.filter(
          (name) => name !== decodeURIComponent(path.split("/").at(-1)!),
        );
      else if (path.endsWith("issues/comments/10"))
        Object.assign(comments[1], payload);
      else if (path.endsWith("issues/42/comments") && method === "POST")
        comments.push({
          id: 11,
          ...payload,
          user: { id: input.publisherActorId, type: "Bot" },
        });
      else if (path.endsWith("issues/42")) Object.assign(issue, payload);
      else throw new Error(`Unexpected mutation ${path}`);
      return JSON.stringify(issue);
    };
    const adapter = {
      operation,
      state,
      gh,
      load: async () => state,
      commit: async () => {
        throw new Error("No canonical republish");
      },
    };
    expect(await projectAutomationLifecycle(adapter)).toEqual({
      status: "complete",
    });
    expect(issue.state).toBe("closed");
    expect(issue.labels).toContain("human-label");
    expect(issue.labels).not.toContain("needs-maintainer-review");
    expect(foreign.body).toContain("Foreign");
    expect(comments[1].body).toContain('"status":"merged"');
    const count = writes.length;
    expect(await projectAutomationLifecycle(adapter)).toEqual({
      status: "complete",
    });
    expect(writes).toHaveLength(count);
    issue.body = issue.body!.replace(
      producer === "project-submission"
        ? '"additional_context":null'
        : '"explanation":null',
      producer === "project-submission"
        ? '"additional_context":"Changed"'
        : '"explanation":"Changed"',
    );
    expect(await projectAutomationLifecycle(adapter)).toEqual({
      status: "superseded",
    });
    expect(writes).toHaveLength(count);
  },
);

test("an advisory notice survives a lost pointer commit, ignores foreign marker custody and commits its canonical pointer only once", async () => {
  const input = catalogInventoryFixture();
  const operation = discoverCatalogOperations(input).find(
    (value) => value.identity.kind === "advisory",
  )!;
  operation.stage = "deployment-confirmed";
  operation.expectedSha = "b".repeat(40);
  const review = {
    schema_version: 1,
    project_id: "example-project",
    source_id: "github-42",
    source_identity: "github:owner/repo",
    evidence_fingerprint: createPolicyEvidenceFingerprint({
      projectId: "example-project",
      sourceId: "github-42",
      headSha: "a".repeat(40),
      policyVersion: operation.identity.policyVersion,
    }),
    policy_version: operation.identity.policyVersion,
    status: "review-suggested",
    category: "potential-other-catalog-policy-conflict",
    reviewed_at: new Date(input.nowMs).toISOString(),
    retry: { attempts: 0, last_failure_at: null },
    maintenance_issue_number: null as number | null,
  };
  const state = {
    root: process.cwd(),
    repository: "MentallyQuill/Tavernary",
    publisherActorId: 4624827,
    nowMs: input.nowMs,
    receipts: [],
    operations: [operation],
    remote: { issues: [], pulls: [], runs: [], mainHeadSha: "b".repeat(40) },
    local: {
      ...input.catalog,
      snapshots: input.evidence,
      advisoryState: [review],
      revision: "b".repeat(40),
    },
  } as AutomationInventoryState;
  const notices = [
    {
      number: 12,
      title: "Foreign",
      body: `<!-- tavernary-advisory-operation:${operation.key} -->`,
      labels: [],
      state: "open",
      user: { id: 99, type: "Bot" },
    },
  ];
  let creates = 0,
    commits = 0;
  const gh = async (args: string[], stdin?: string) => {
    const path = args.find((v) => v.startsWith("repos/"))!;
    const method = args.includes("--method")
      ? args[args.indexOf("--method") + 1]
      : "GET";
    if (method === "POST") {
      creates++;
      const value = {
        ...JSON.parse(stdin!),
        number: 73,
        state: "open",
        user: { id: 4624827, type: "Bot" },
      };
      notices.push(value);
      return JSON.stringify(value);
    }
    if (method !== "GET") throw new Error("Unexpected mutation");
    if (path.includes("issues?")) return JSON.stringify(notices);
    if (path.includes("/labels/"))
      return JSON.stringify({ name: "catalog-policy-advisory" });
    if (path.endsWith("issues/73")) return JSON.stringify(notices[1]);
    throw new Error(`Unexpected read ${path}`);
  };
  const commit = async (value: { files: { content: string }[] }) => {
    commits++;
    if (commits === 1)
      throw Object.assign(new Error("Lost pointer commit"), { status: 503 });
    Object.assign(review, JSON.parse(value.files[0].content));
    return { sha: "c".repeat(40) };
  };
  const adapter = { operation, state, gh, load: async () => state, commit };
  await expect(projectAutomationLifecycle(adapter)).rejects.toThrow(
    "Lost pointer commit",
  );
  expect(creates).toBe(1);
  expect(await projectAutomationLifecycle(adapter)).toEqual({
    status: "complete",
  });
  expect(review.maintenance_issue_number).toBe(73);
  expect(await projectAutomationLifecycle(adapter)).toEqual({
    status: "complete",
  });
  expect(creates).toBe(1);
  expect(commits).toBe(2);
});

function kitFixture() {
  const input = kitInventoryFixture({
    canonicalPublished: true,
    confirmedDeployment: true,
  });
  const issue = {
    ...input.issues[0],
    labels: [...input.issues[0].labels, "human-label"],
  };
  const operation = discoverKitOperations(input)[0];
  const state = {
    root: process.cwd(),
    repository: "MentallyQuill/Tavernary",
    publisherActorId: input.publisherActorId,
    nowMs: input.nowMs,
    receipts: [],
    operations: [operation],
    remote: {
      issues: [issue],
      pulls: [],
      runs: [],
      mainHeadSha: operation.expectedSha,
    },
    local: {
      kits: input.kits,
      projects: input.projects,
      sources: Object.values(input.sourcesById),
      snapshots: [],
      blockedUsers: input.blockedUsers,
      confirmedRevisions: input.confirmedRevisions,
      revision: operation.expectedSha,
    },
  } as AutomationInventoryState;
  const writes: { path: string; payload: Record<string, unknown> }[] = [];
  let failClosure = true;
  const gh = async (args: string[], stdin?: string) => {
    const path = args.find((v) => v.startsWith("repos/"))!;
    const method = args.includes("--method")
      ? args[args.indexOf("--method") + 1]
      : "GET";
    if (method === "GET") {
      if (path.endsWith("issues/42")) return JSON.stringify(issue);
      if (path.includes("/labels/"))
        return JSON.stringify({ name: path.split("/").at(-1) });
      throw new Error(`Unexpected read ${path}`);
    }
    const payload = JSON.parse(stdin ?? "{}");
    if (method === "PATCH" && failClosure) {
      failClosure = false;
      throw Object.assign(new Error("Temporary failure"), { status: 503 });
    }
    writes.push({ path, payload });
    if (path.endsWith("/labels"))
      issue.labels = [...new Set([...issue.labels, ...payload.labels])];
    else if (path.includes("/labels/") && method === "DELETE")
      issue.labels = issue.labels.filter(
        (label) => label !== decodeURIComponent(path.split("/").at(-1)!),
      );
    else Object.assign(issue, payload);
    return JSON.stringify(issue);
  };
  return {
    operation,
    inventory: input,
    state,
    gh,
    load: async () => state,
    writes,
    issue,
    commit: async () => {
      throw new Error("Kit finalization must not write canonical data");
    },
  };
}

test("Kit lifecycle retries only the remaining issue projection, preserves human labels and becomes read-only", async () => {
  const input = kitFixture();
  await expect(projectAutomationLifecycle(input)).rejects.toThrow(
    "Temporary failure",
  );
  expect(input.issue.labels).toContain("human-label");
  expect(input.issue.labels).toContain("kit-published");
  expect(await projectAutomationLifecycle(input)).toEqual({
    status: "complete",
  });
  expect(input.issue.state).toBe("closed");
  const count = input.writes.length;
  expect(await projectAutomationLifecycle(input)).toEqual({
    status: "complete",
  });
  expect(input.writes).toHaveLength(count);
});

test("fresh Kit discovery survives completed issue projection until its terminal receipt is saved", async () => {
  const input = kitFixture();
  input.inventory.issues = [input.issue];
  input.inventory.receipts = [receiptFixture({ operation: input.operation })];
  const load = async () => ({
    ...input.state,
    receipts: input.inventory.receipts,
    operations: discoverKitOperations(input.inventory),
  });
  const receipts: AutomationReceipt[] = [];
  const finalizer = {
    operationKey: input.operation.key,
    load,
    project: async () =>
      projectAutomationLifecycle({ ...input, state: await load(), load }),
    persist: async (receipt: AutomationReceipt) => {
      receipts.push(receipt);
      input.inventory.receipts = [receipt];
    },
  };
  await expect(finalizeAutomationOperation(finalizer)).rejects.toThrow(
    "Temporary failure",
  );
  expect(await finalizeAutomationOperation(finalizer)).toEqual({
    status: "finalized",
  });
  expect(input.issue.state).toBe("closed");
  expect(input.issue.state_reason).toBe("completed");
  expect(receipts).toHaveLength(1);
  expect(receipts[0].operation).toMatchObject({
    key: input.operation.key,
    expectedSha: input.operation.expectedSha,
    stage: "finalized",
  });
  const writes = input.writes.length;
  expect(await finalizeAutomationOperation(finalizer)).toEqual({
    status: "superseded",
  });
  expect(input.writes).toHaveLength(writes);
  expect(receipts).toHaveLength(1);
});

test("edited Kit input and a human decline cannot close a newer request", async () => {
  const input = kitFixture();
  input.issue.body = input.issue.body!.replace("Example Kit", "Changed Kit");
  expect(await projectAutomationLifecycle(input)).toEqual({
    status: "superseded",
  });
  expect(input.writes).toEqual([]);
  const declined = kitFixture();
  declined.issue.labels.push("submission-declined");
  expect(await projectAutomationLifecycle(declined)).toEqual({
    status: "superseded",
  });
  expect(declined.writes).toEqual([]);
});

test("project finalization refetches exact Publisher custody before it can change any issue", async () => {
  const input = projectInventoryFixture({
    merged: true,
    confirmedDeployment: true,
  });
  const operation = discoverProjectOperations(input)[0];
  const state = {
    root: process.cwd(),
    repository: "MentallyQuill/Tavernary",
    publisherActorId: input.publisherActorId,
    nowMs: input.nowMs,
    receipts: [],
    operations: [operation],
    remote: {
      issues: input.issues,
      pulls: input.pulls,
      runs: [],
      mainHeadSha: operation.expectedSha,
    },
    local: { ...input.catalog, revision: operation.expectedSha },
  } as AutomationInventoryState;
  const gh = async (args: string[]) => {
    if (args.includes("--method"))
      throw new Error("Untrusted pull must not mutate");
    const path = args.find((v) => v.startsWith("repos/"))!;
    if (path.endsWith("pulls/84"))
      return JSON.stringify({
        ...input.pulls[0],
        user: { id: 99, type: "Bot" },
      });
    if (path.endsWith("issues/42")) return JSON.stringify(input.issues[0]);
    throw new Error("Untrusted pull must not request more data");
  };
  expect(
    await projectAutomationLifecycle({
      operation,
      state,
      load: async () => state,
      gh,
      commit: async () => {
        throw new Error("No commit");
      },
    }),
  ).toEqual({ status: "superseded" });
});

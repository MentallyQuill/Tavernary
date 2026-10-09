import { expect, test } from "vitest";
import { loadAutomationWorkerRuns } from "../../scripts/automation/github-inventory.mjs";
import { revalidateAutomationOperation } from "../../scripts/automation/inventory.mjs";
import {
  assertTrustedAutomationContext,
  loadGithubAutomationInventory,
  persistGithubAutomationReceipt,
} from "../../scripts/automation/github-inventory.mjs";
import { AUTOMATION_NOW, receiptFixture } from "../helpers/automation-fixtures";
import { execFileSync } from "node:child_process";
import { loadAutomationInventory } from "../../scripts/automation/inventory.mjs";

test("the GitHub CLI loader bounds open-work pages and explicitly verifies old worker handles", async () => {
  const calls: string[][] = [];
  const receipt = receiptFixture();
  receipt.operation.workerRunId = 700;
  const gh = async (args: string[]) => {
    calls.push(args);
    const path = args.find((arg) => arg.startsWith("repos/"))!;
    const page = Number(
      args.find((arg) => arg.startsWith("page="))?.slice(5) ?? 1,
    );
    if (path.endsWith("/issues") || path.endsWith("/pulls")) {
      if (args.includes("state=closed")) return "[[]]";
      const total = path.endsWith("/issues") ? 205 : 101;
      return JSON.stringify([
        Array.from(
          { length: Math.max(0, Math.min(100, total - (page - 1) * 100)) },
          (_, i) => ({
            number: (page - 1) * 100 + i + 1,
            state: "open",
            updated_at: new Date(AUTOMATION_NOW).toISOString(),
            labels: [],
          }),
        ),
      ]);
    }
    if (path.endsWith("/git/ref/heads/main"))
      return JSON.stringify({ object: { sha: "d".repeat(40) } });
    if (path.endsWith("/actions/runs/700"))
      return JSON.stringify({
        id: 700,
        status: "in_progress",
        conclusion: null,
      });
    return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
  };
  const inventory = await loadGithubAutomationInventory({
    gh,
    repository: "MentallyQuill/Tavernary",
    receipts: [receipt],
    nowMs: AUTOMATION_NOW,
  });
  expect(inventory.issues).toHaveLength(205);
  expect(inventory.pulls).toHaveLength(101);
  expect(inventory.runs).toContainEqual(
    expect.objectContaining({ id: 700, status: "in_progress" }),
  );
  expect(
    calls
      .filter((args) =>
        args.some((arg) => arg.endsWith("/issues") || arg.endsWith("/pulls")),
      )
      .every(
        (args) => !args.includes("--paginate") && !args.includes("--slurp"),
      ),
  ).toBe(true);
});

test("closed history stops at the retention window while old decisions for active branches remain visible", async () => {
  const calls: string[][] = [];
  const old = new Date(AUTOMATION_NOW - 365 * 86400000).toISOString();
  const issue = {
    number: 42,
    state: "open",
    created_at: old,
    updated_at: old,
    labels: [{ name: "project-submission" }],
  };
  const declined = {
    number: 84,
    state: "closed",
    updated_at: old,
    merged_at: null,
    head: { ref: "automation/project-submission-42" },
  };
  const gh = async (args: string[]) => {
    calls.push(args);
    const path = args.find((arg) => arg.startsWith("repos/"))!;
    if (path.endsWith("/git/ref/heads/main"))
      return JSON.stringify({ object: { sha: "d".repeat(40) } });
    if (path.endsWith("/issues"))
      return JSON.stringify([args.includes("state=open") ? [issue] : []]);
    if (path.endsWith("/pulls")) {
      if (args.includes("head=MentallyQuill:automation/project-submission-42"))
        return JSON.stringify([[declined]]);
      if (
        args.includes("state=open") ||
        args.some((arg) => arg.startsWith("head="))
      )
        return "[[]]";
      return JSON.stringify([[declined]]);
    }
    return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
  };
  const result = await loadGithubAutomationInventory({
    gh,
    repository: "MentallyQuill/Tavernary",
    receipts: [],
    nowMs: AUTOMATION_NOW,
  });
  expect(result.issues).toEqual([issue]);
  expect(result.pulls).toEqual([declined]);
  const global = calls.filter(
    (args) =>
      args.some((arg) => arg.endsWith("/issues") || arg.endsWith("/pulls")) &&
      !args.some((arg) => arg.startsWith("head=")),
  );
  expect(
    global.every(
      (args) => !args.includes("state=all") && !args.includes("--paginate"),
    ),
  ).toBe(true);
  expect(
    global.filter(
      (args) => args.includes("state=closed") && args.includes("sort=updated"),
    ),
  ).toHaveLength(2);
});

test("old closed references needed by pending canonical operations are fetched directly", async () => {
  const receipt = receiptFixture();
  const closed = {
    number: 42,
    state: "closed",
    updated_at: new Date(AUTOMATION_NOW - 365 * 86400000).toISOString(),
    labels: [],
  };
  const calls: string[][] = [];
  const gh = async (args: string[]) => {
    calls.push(args);
    const path = args.find((arg) => arg.startsWith("repos/"))!;
    if (path.endsWith("/git/ref/heads/main"))
      return JSON.stringify({ object: { sha: "d".repeat(40) } });
    if (path.endsWith("/issues/42")) return JSON.stringify(closed);
    if (path.endsWith("/issues") || path.endsWith("/pulls")) return "[[]]";
    return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
  };
  const result = await loadGithubAutomationInventory({
    gh,
    repository: "MentallyQuill/Tavernary",
    receipts: [receipt],
    nowMs: AUTOMATION_NOW,
  });
  expect(result.issues).toEqual([closed]);
  expect(
    calls.filter((args) => args.some((arg) => arg.endsWith("/issues/42"))),
  ).toHaveLength(1);
});

test("bounded pagination stops before fetching beyond an overloaded current-work inventory", async () => {
  let issuePages = 0;
  const gh = async (args: string[]) => {
    const path = args.find((arg) => arg.startsWith("repos/"))!;
    if (path.endsWith("/git/ref/heads/main"))
      return JSON.stringify({ object: { sha: "d".repeat(40) } });
    if (path.endsWith("/issues") && args.includes("state=open")) {
      issuePages++;
      const page = Number(
        args.find((arg) => arg.startsWith("page="))?.slice(5) ?? 1,
      );
      return JSON.stringify([
        Array.from({ length: 100 }, (_, index) => ({
          number: (page - 1) * 100 + index + 1,
          state: "open",
          labels: [],
        })),
      ]);
    }
    if (path.endsWith("/issues") || path.endsWith("/pulls")) return "[[]]";
    return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
  };
  await expect(
    loadGithubAutomationInventory({
      gh,
      repository: "MentallyQuill/Tavernary",
      receipts: [],
      nowMs: AUTOMATION_NOW,
    }),
  ).rejects.toThrow(/bound/u);
  expect(issuePages).toBe(20);
});

test("large closed history cannot block open work or omit an explicitly pending old reference", async () => {
  let closedPages = 0;
  const receipt = receiptFixture();
  const gh = async (args: string[]) => {
    const path = args.find((arg) => arg.startsWith("repos/"))!;
    if (path.endsWith("/git/ref/heads/main"))
      return JSON.stringify({ object: { sha: "d".repeat(40) } });
    if (path.endsWith("/issues/42"))
      return JSON.stringify({ number: 42, state: "closed", labels: [] });
    if (path.endsWith("/issues") && args.includes("state=closed")) {
      closedPages++;
      return JSON.stringify([
        Array.from({ length: 100 }, (_, index) => ({
          number: 1000 + closedPages * 100 + index,
          state: "closed",
          labels: [],
          updated_at: new Date(AUTOMATION_NOW).toISOString(),
        })),
      ]);
    }
    if (path.endsWith("/issues") || path.endsWith("/pulls")) return "[[]]";
    return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
  };
  const inventory = await loadGithubAutomationInventory({
    gh,
    repository: "MentallyQuill/Tavernary",
    receipts: [receipt],
    nowMs: AUTOMATION_NOW,
  });
  expect(closedPages).toBe(20);
  expect(inventory.issues).toHaveLength(2001);
  expect(inventory.issues).toContainEqual({
    number: 42,
    state: "closed",
    labels: [],
  });
});

test("an unreceipted publication keeps its old issue reference and an outage cannot erase it", async () => {
  const operation = receiptFixture().operation;
  let unavailable = false;
  const gh = async (args: string[]) => {
    const path = args.find((arg) => arg.startsWith("repos/"))!;
    if (path.endsWith("/git/ref/heads/main"))
      return JSON.stringify({ object: { sha: "d".repeat(40) } });
    if (path.endsWith("/issues/42")) {
      if (unavailable) throw { status: 503 };
      return JSON.stringify({ number: 42, state: "closed", labels: [] });
    }
    if (path.endsWith("/issues") || path.endsWith("/pulls")) return "[[]]";
    return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
  };
  const input = {
    gh,
    repository: "MentallyQuill/Tavernary",
    receipts: [],
    referencedOperations: [operation],
    nowMs: AUTOMATION_NOW,
  };
  expect((await loadGithubAutomationInventory(input)).issues).toContainEqual({
    number: 42,
    state: "closed",
    labels: [],
  });
  unavailable = true;
  await expect(loadGithubAutomationInventory(input)).rejects.toMatchObject({
    status: 503,
  });
});

test("an oversized page is rejected before a second history fetch", async () => {
  let calls = 0;
  await expect(
    loadAutomationWorkerRuns({
      gh: async () => {
        calls++;
        return " ".repeat(4 * 1024 * 1024 + 1);
      },
      repository: "MentallyQuill/Tavernary",
      nowMs: AUTOMATION_NOW,
    }),
  ).rejects.toThrow(/byte bound/u);
  expect(calls).toBe(1);
});

test("a run search over GitHub's thousand-result cap is split into smaller time windows", async () => {
  const queries: string[] = [];
  let capped = true;
  const gh = async (args: string[]) => {
    const path = args.find((arg) => arg.startsWith("repos/"))!;
    if (path.endsWith("/issues") || path.endsWith("/pulls")) return "[[]]";
    if (path.endsWith("/git/ref/heads/main"))
      return JSON.stringify({ object: { sha: "d".repeat(40) } });
    const created = args.find((arg) => arg.startsWith("created="));
    if (created) {
      queries.push(created);
      if (capped) {
        expect(args).not.toContain("--paginate");
        capped = false;
        return JSON.stringify([{ total_count: 1001, workflow_runs: [] }]);
      }
    }
    return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
  };
  await loadGithubAutomationInventory({
    gh,
    repository: "MentallyQuill/Tavernary",
    receipts: [],
    nowMs: AUTOMATION_NOW,
  });
  expect(queries).toHaveLength(3);
});

test("a worker lookup outage fails closed instead of assuming abandonment", async () => {
  const receipt = receiptFixture();
  receipt.operation.workerRunId = 700;
  const gh = async (args: string[]) => {
    const path = args.find((arg) => arg.startsWith("repos/"))!;
    if (path.endsWith("/issues") || path.endsWith("/pulls")) return "[[]]";
    if (path.endsWith("/git/ref/heads/main"))
      return JSON.stringify({ object: { sha: "d".repeat(40) } });
    if (path.endsWith("/actions/runs/700")) throw { status: 503 };
    return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
  };
  await expect(
    loadGithubAutomationInventory({
      gh,
      repository: "MentallyQuill/Tavernary",
      receipts: [receipt],
      nowMs: AUTOMATION_NOW,
    }),
  ).rejects.toMatchObject({ status: 503 });
});

test("apply context requires trusted main code, repository and actor", () => {
  const env = {
    GITHUB_REF: "refs/heads/main",
    GITHUB_REPOSITORY: "MentallyQuill/Tavernary",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_ACTOR_ID: "2625904",
    TAVERNARY_PUBLISHER_BOT_ID: "41982982",
  };
  expect(() =>
    assertTrustedAutomationContext(env, "MentallyQuill/Tavernary"),
  ).not.toThrow();
  for (const override of [
    { GITHUB_REF: "refs/heads/feature" },
    { GITHUB_REPOSITORY: "attacker/Tavernary" },
    { GITHUB_ACTOR_ID: "123" },
  ])
    expect(() =>
      assertTrustedAutomationContext(
        { ...env, ...override },
        "MentallyQuill/Tavernary",
      ),
    ).toThrow();
});

test("receipt persistence writes only the validated key path and preserves real JSON", async () => {
  const receipt = receiptFixture();
  const writes: Array<{ args: string[]; body?: string }> = [];
  const gh = async (args: string[], body?: string) => {
    if (args.includes("PUT")) {
      writes.push({ args, body });
      return "{}";
    }
    throw { status: 404 };
  };
  await persistGithubAutomationReceipt({
    gh,
    repository: "MentallyQuill/Tavernary",
    receipt,
  });
  expect(writes).toHaveLength(1);
  expect(writes[0].args).toContain(
    `repos/MentallyQuill/Tavernary/contents/data/maintenance/automation/operations/${receipt.operation.key}.json`,
  );
  const request = JSON.parse(writes[0].body!);
  expect(request.branch).toBe("main");
  expect(
    JSON.parse(Buffer.from(request.content, "base64").toString("utf8")),
  ).toEqual(receipt);
});

test("unchanged receipt persistence makes no heartbeat commit", async () => {
  const receipt = receiptFixture();
  let writes = 0;
  const gh = async (args: string[]) => {
    if (args.includes("PUT")) writes++;
    return JSON.stringify({
      sha: "a".repeat(40),
      content: Buffer.from(JSON.stringify(receipt)).toString("base64"),
      encoding: "base64",
    });
  };
  await persistGithubAutomationReceipt({
    gh,
    repository: "MentallyQuill/Tavernary",
    receipt: {
      ...receipt,
      updatedAt: new Date(AUTOMATION_NOW + 60_000).toISOString(),
    },
  });
  expect(writes).toBe(0);
});

test("a valid receipt stored under another operation key is rejected before overwrite", async () => {
  const receipt = receiptFixture();
  let writes = 0;
  const unrelated = receiptFixture();
  unrelated.operation.identity.inputDigest = "f".repeat(64);
  const { operationKey } =
    await import("../../scripts/automation/operation.mjs");
  unrelated.operation.key = operationKey(unrelated.operation.identity);
  const gh = async (args: string[]) => {
    if (args.includes("PUT")) writes++;
    return JSON.stringify({
      sha: "a".repeat(40),
      content: Buffer.from(JSON.stringify(unrelated)).toString("base64"),
      encoding: "base64",
    });
  };
  await expect(
    persistGithubAutomationReceipt({
      gh,
      repository: "MentallyQuill/Tavernary",
      receipt,
    }),
  ).rejects.toThrow();
  expect(writes).toBe(0);
});

test("the production loader reconstructs real canonical maintenance without writing generated assets", async () => {
  const before = execFileSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
  });
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const gh = async (args: string[]) => {
    const path = args.find((arg) => arg.startsWith("repos/"))!;
    if (path.endsWith("/issues") || path.endsWith("/pulls")) return "[[]]";
    if (path.endsWith("/git/ref/heads/main"))
      return JSON.stringify({ object: { sha: head } });
    return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
  };
  const state = await loadAutomationInventory({
    root: process.cwd(),
    gh,
    repository: "MentallyQuill/Tavernary",
    publisherActorId: 41_982_982,
    nowMs: AUTOMATION_NOW,
    reportIndex: {
      schema_version: 5,
      generated_at: new Date(AUTOMATION_NOW).toISOString(),
      reports: [],
    },
  });
  expect(
    state.operations.some((operation) => operation.identity.kind === "refresh"),
  ).toBe(true);
  expect(
    state.operations.some(
      (operation) => operation.identity.kind === "advisory",
    ),
  ).toBe(true);
  expect(
    state.operations.filter(
      (operation) => operation.identity.kind === "deployment",
    ),
  ).toHaveLength(1);
  expect(
    execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }),
  ).toBe(before);
});

test("the final worker lookup paginates and refuses truncated filtered inventories", async () => {
  let captured: string[] = [];
  const gh = async (args: string[]) => {
    captured = args;
    return JSON.stringify([
      {
        total_count: 101,
        workflow_runs: args.includes("page=2")
          ? [{ id: 101 }]
          : Array.from({ length: 100 }, (_, i) => ({ id: i + 1 })),
      },
    ]);
  };
  expect(
    await loadAutomationWorkerRuns({
      gh,
      repository: "MentallyQuill/Tavernary",
      nowMs: AUTOMATION_NOW,
    }),
  ).toEqual(Array.from({ length: 101 }, (_, i) => ({ id: i + 1 })));
  expect(captured).toContain("page=2");
  expect(captured).not.toContain("--paginate");
  expect(captured).not.toContain("--slurp");
  await expect(
    loadAutomationWorkerRuns({
      gh: async () =>
        JSON.stringify([{ total_count: 1001, workflow_runs: [] }]),
      repository: "MentallyQuill/Tavernary",
      nowMs: AUTOMATION_NOW,
    }),
  ).rejects.toThrow();
});

test("an overloaded active-run search refuses on its first page without spending pagination requests", async () => {
  const calls: string[][] = [];
  const gh = async (args: string[]) => {
    calls.push(args);
    const path = args.find((arg) => arg.startsWith("repos/"))!;
    if (path.endsWith("/issues") || path.endsWith("/pulls")) return "[[]]";
    if (path.endsWith("/git/ref/heads/main"))
      return JSON.stringify({ object: { sha: "d".repeat(40) } });
    return JSON.stringify([
      {
        total_count: args.includes("status=queued") ? 1001 : 0,
        workflow_runs: [],
      },
    ]);
  };
  await expect(
    loadGithubAutomationInventory({
      gh,
      repository: "MentallyQuill/Tavernary",
      receipts: [],
      nowMs: AUTOMATION_NOW,
    }),
  ).rejects.toThrow(/cap/u);
  expect(calls.filter((args) => args.includes("status=queued"))).toHaveLength(
    1,
  );
  expect(calls.find((args) => args.includes("status=queued"))).not.toContain(
    "--paginate",
  );
});

test("the emergency publication switch waits without dispatch or an incident retry", async () => {
  const operation = receiptFixture().operation;
  operation.identity.kind = "project";
  operation.stage = "generated";
  const result = await revalidateAutomationOperation({
    state: {} as never,
    operation,
    gh: async () => {
      throw new Error("should not call GitHub");
    },
    repository: "MentallyQuill/Tavernary",
    nowMs: AUTOMATION_NOW,
    env: { PROJECT_AUTO_PUBLICATION_ENABLED: "false" },
  });
  expect(result).toBeNull();
});

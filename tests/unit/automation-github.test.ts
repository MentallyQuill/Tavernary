import { expect, test } from "vitest";
import {
  GithubInventoryUnavailableError,
  loadAutomationWorkerRuns,
} from "../../scripts/automation/github-inventory.mjs";
import { revalidateAutomationOperation } from "../../scripts/automation/inventory.mjs";
import {
  assertTrustedAutomationContext,
  loadGithubAutomationInventory,
  loadSiteWriterRecoveryRuns,
  persistGithubAutomationReceipt,
} from "../../scripts/automation/github-inventory.mjs";
import {
  AUTOMATION_NOW,
  controllerFixture,
  operationFixture,
  receiptFixture,
} from "../helpers/automation-fixtures";
import { reconcileAutomation } from "../../scripts/automation/reconcile.mjs";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
import { execFileSync } from "node:child_process";
import { loadAutomationInventory } from "../../scripts/automation/inventory.mjs";
import { productionInventoryRoot } from "../helpers/production-inventory-root.mjs";
import { operationKey } from "../../scripts/automation/operation.mjs";

async function loadRunSlice(
  scope: "active" | "delta",
  read: (args: string[]) => Promise<string>,
) {
  const input = {
    repository: "MentallyQuill/Tavernary",
    nowMs: AUTOMATION_NOW,
    gh: read,
  };
  if (scope === "delta") return loadAutomationWorkerRuns(input);
  return (
    await loadGithubAutomationInventory({
      ...input,
      receipts: [],
      gh: async (args) => {
        const path = args.find((argument) => argument.startsWith("repos/"))!;
        if (path.endsWith("/issues") || path.endsWith("/pulls")) return "[[]]";
        if (path.endsWith("/git/ref/heads/main"))
          return JSON.stringify({ object: { sha: "d".repeat(40) } });
        return args.includes("status=queued")
          ? read(args)
          : JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
      },
    })
  ).runs;
}

test.each(
  (["active", "delta"] as const).flatMap((scope) =>
    [
      { name: "missing rows", total: 1, rows: [] },
      {
        name: "duplicate rows",
        total: 2,
        rows: [
          { id: 1, status: "queued" },
          { id: 1, status: "queued" },
        ],
      },
      { name: "null row", total: 1, rows: [null] },
      { name: "zero id", total: 1, rows: [{ id: 0, status: "queued" }] },
      {
        name: "fractional id",
        total: 1,
        rows: [{ id: 1.5, status: "queued" }],
      },
      {
        name: "unsafe id",
        total: 1,
        rows: [{ id: 9007199254740992, status: "queued" }],
      },
      { name: "string id", total: 1, rows: [{ id: "1", status: "queued" }] },
      { name: "missing id", total: 1, rows: [{ status: "queued" }] },
      { name: "missing status", total: 1, rows: [{ id: 1 }] },
      { name: "non-string status", total: 1, rows: [{ id: 1, status: null }] },
      {
        name: "understated total",
        total: 0,
        rows: [{ id: 1, status: "queued" }],
      },
    ].map((slice) => ({ scope, ...slice })),
  ),
)(
  "$scope rejects $name after two complete attempts",
  async ({ scope, total, rows }) => {
    const pages: string[] = [];
    await expect(
      loadRunSlice(scope, async (args) => {
        pages.push(args.find((argument) => argument.startsWith("page="))!);
        return JSON.stringify([{ total_count: total, workflow_runs: rows }]);
      }),
    ).rejects.toBeInstanceOf(GithubInventoryUnavailableError);
    expect(pages).toEqual(["page=1", "page=1"]);
  },
);

test("an incomplete active census retries once before refusing absence authority", async () => {
  let activeReads = 0;
  await expect(
    loadGithubAutomationInventory({
      repository: "MentallyQuill/Tavernary",
      receipts: [],
      nowMs: AUTOMATION_NOW,
      gh: async (args) => {
        const path = args.find((argument) => argument.startsWith("repos/"))!;
        if (path.endsWith("/issues") || path.endsWith("/pulls")) return "[[]]";
        if (path.endsWith("/git/ref/heads/main"))
          return JSON.stringify({ object: { sha: "d".repeat(40) } });
        if (args.includes("status=queued")) activeReads++;
        return JSON.stringify([
          {
            total_count: args.includes("status=queued") ? 1 : 0,
            workflow_runs: [],
          },
        ]);
      },
    }),
  ).rejects.toMatchObject({ code: "github-inventory-unavailable" });
  expect(activeReads).toBe(2);
});

test.each(
  (["active", "delta"] as const).flatMap((scope) =>
    [false, true].map((persistent) => ({ scope, persistent })),
  ),
)(
  "$scope discards short multi-page attempts before retrying (persistent=$persistent)",
  async ({ scope, persistent }) => {
    const pages: number[] = [];
    let attempt = 0;
    const result = loadRunSlice(scope, async (args) => {
      const page = Number(
        args.find((argument) => argument.startsWith("page="))!.slice(5),
      );
      pages.push(page);
      if (page === 1) attempt++;
      const inconsistent = persistent || attempt === 1;
      return JSON.stringify([
        {
          total_count: inconsistent ? (page === 1 ? 101 : 102) : 1,
          workflow_runs: inconsistent
            ? Array.from({ length: page === 1 ? 100 : 1 }, (_, index) => ({
                id: (page - 1) * 100 + index + 1,
                status: page === 1 ? "completed" : "queued",
              }))
            : [{ id: 999, status: "waiting" }],
        },
      ]);
    });
    if (persistent) {
      await expect(result).rejects.toBeInstanceOf(
        GithubInventoryUnavailableError,
      );
      expect(pages).toEqual([1, 2, 1, 2]);
    } else {
      expect(await result).toEqual([{ id: 999, status: "waiting" }]);
      expect(pages).toEqual([1, 2, 1]);
    }
  },
);

test.each(["active", "delta"] as const)(
  "%s preserves native failures without retrying them as incomplete slices",
  async (scope) => {
    for (const status of [401, 403, 429, 503]) {
      const error = Object.assign(new Error("HTTP unavailable"), { status });
      let reads = 0;
      await expect(
        loadRunSlice(scope, async () => {
          reads++;
          throw error;
        }),
      ).rejects.toBe(error);
      expect(reads).toBe(1);
    }
  },
);

test("a run transitioning between active status slices remains valid inventory", async () => {
  const inventory = await loadGithubAutomationInventory({
    repository: "MentallyQuill/Tavernary",
    nowMs: AUTOMATION_NOW,
    receipts: [],
    gh: async (args) => {
      const path = args.find((argument) => argument.startsWith("repos/"))!;
      if (path.endsWith("/issues") || path.endsWith("/pulls")) return "[[]]";
      if (path.endsWith("/git/ref/heads/main"))
        return JSON.stringify({ object: { sha: "d".repeat(40) } });
      const status = args.includes("status=queued")
        ? "queued"
        : args.includes("status=in_progress")
          ? "in_progress"
          : null;
      return JSON.stringify([
        {
          total_count: status ? 1 : 0,
          workflow_runs: status ? [{ id: 777, status }] : [],
        },
      ]);
    },
  });
  expect(inventory.runs).toEqual([{ id: 777, status: "in_progress" }]);
});

test.each(["initial", "revalidation"] as const)(
  "an incomplete %s controller census stops before candidate persistence or dispatch",
  async (phase) => {
    const effects = controllerFixture();
    const operation = operationFixture({
      identity: {
        ...operationFixture().identity,
        kind: "metadata",
        subject: "source:github-42:example-project",
      },
    });
    const state = {
      root: process.cwd(),
      repository: "MentallyQuill/Tavernary",
      publisherActorId: 317929880,
      nowMs: AUTOMATION_NOW,
      receipts: [],
      operations: [operation],
      local: { modelBudget: { reservations: [], calls: 0, tokens: 0 } },
      remote: { issues: [], pulls: [], runs: [], mainHeadSha: "d".repeat(40) },
    } as AutomationInventoryState;
    const before = JSON.stringify({ operation, local: state.local });
    let reads = 0;
    const gh = async () => {
      reads++;
      return JSON.stringify([{ total_count: 1, workflow_runs: [] }]);
    };
    await expect(
      reconcileAutomation({
        ...effects.input,
        inventory: async () => {
          if (phase === "initial") await loadRunSlice("active", gh);
          return [operation];
        },
        revalidate: (candidate) =>
          revalidateAutomationOperation({
            state,
            operation: candidate,
            gh,
            repository: state.repository,
            nowMs: AUTOMATION_NOW,
          }),
      }),
    ).rejects.toBeInstanceOf(GithubInventoryUnavailableError);
    expect(reads).toBe(2);
    expect(effects.receipts).toEqual([]);
    expect(effects.dispatches).toEqual([]);
    expect(JSON.stringify({ operation, local: state.local })).toBe(before);
  },
);

test("confirmed project finalization reads its fresh issue, all deterministic PR history and saved worker without global histories", async () => {
  const receipt = receiptFixture();
  Object.assign(receipt.operation, {
    stage: "deployment-confirmed",
    expectedSha: "d".repeat(40),
    workerRunId: 700,
  });
  receipt.operation.identity.kind = "project";
  receipt.operation.identity.subject = "issue:42";
  const calls: string[][] = [];
  let body = "original";
  const gh = async (args: string[]) => {
    calls.push(args);
    const path = args.find((arg) => arg.startsWith("repos/"))!;
    if (path.endsWith("/git/ref/heads/main"))
      return JSON.stringify({ object: { sha: "d".repeat(40) } });
    if (path.endsWith("/issues/42"))
      return JSON.stringify({
        number: 42,
        state: "open",
        body,
        labels: [{ name: "project-submission" }],
      });
    if (path.endsWith("/actions/runs/700"))
      return JSON.stringify({
        id: 700,
        status: "completed",
        conclusion: "success",
      });
    if (
      path.endsWith("/pulls") &&
      args.includes("head=MentallyQuill:automation/project-submission-42")
    ) {
      expect(args).toContain("state=all");
      return JSON.stringify([
        [{ number: 800, state: "closed", merged_at: null }],
      ]);
    }
    throw new Error("Unrelated repository inventory requested.");
  };
  const input = {
    gh,
    repository: "MentallyQuill/Tavernary",
    receipts: [receipt],
    nowMs: AUTOMATION_NOW,
    finalizationOperation: receipt.operation,
  };
  const first = await loadGithubAutomationInventory(input);
  expect(first.issues[0].body).toBe("original");
  expect(first.pulls).toContainEqual(
    expect.objectContaining({ number: 800, merged_at: null }),
  );
  expect(first.runs).toContainEqual(expect.objectContaining({ id: 700 }));
  expect(calls).toHaveLength(4);
  body = "owner changed the request";
  expect((await loadGithubAutomationInventory(input)).issues[0].body).toBe(
    body,
  );
  expect(calls).toHaveLength(8);
});

test("a finalization scope never hides a native issue outage", async () => {
  const receipt = receiptFixture();
  Object.assign(receipt.operation, {
    stage: "deployment-confirmed",
    expectedSha: "d".repeat(40),
    workerRunId: null,
  });
  receipt.operation.identity.kind = "kit";
  receipt.operation.identity.subject = "issue:42";
  receipt.operation.key = operationKey(receipt.operation.identity);
  await expect(
    loadGithubAutomationInventory({
      repository: "MentallyQuill/Tavernary",
      receipts: [receipt],
      nowMs: AUTOMATION_NOW,
      finalizationOperation: receipt.operation,
      gh: async (args) => {
        const path = args.find((arg) => arg.startsWith("repos/"))!;
        if (path.endsWith("/git/ref/heads/main"))
          return JSON.stringify({ object: { sha: "d".repeat(40) } });
        if (path.endsWith("/issues/42")) throw { status: 503 };
        throw new Error("Unexpected global read");
      },
    }),
  ).rejects.toMatchObject({ status: 503 });
});

test("site recovery splits an over-cap completed search before pagination and reads every smaller window", async () => {
  const calls: string[][] = [];
  let completedQueries = 0;
  const runs = await loadSiteWriterRecoveryRuns({
    repository: "MentallyQuill/Tavernary",
    nowMs: AUTOMATION_NOW,
    workflow: "restore-site.yml",
    gh: async (args) => {
      calls.push(args);
      if (!args.includes("status=completed"))
        return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
      completedQueries++;
      const page = Number(
        args.find((arg) => arg.startsWith("page="))!.slice(5),
      );
      if (completedQueries === 1)
        return JSON.stringify([{ total_count: 1001, workflow_runs: [] }]);
      return JSON.stringify([
        {
          total_count: 101,
          workflow_runs: Array.from(
            { length: page === 1 ? 100 : 1 },
            (_, i) => ({
              id: (completedQueries <= 3 ? 0 : 200) + (page - 1) * 100 + i + 1,
            }),
          ),
        },
      ]);
    },
  });
  expect(runs).toHaveLength(202);
  const completed = calls.filter((args) => args.includes("status=completed"));
  expect(completed).toHaveLength(5);
  expect(completed[0]).toContain("page=1");
  expect(completed[1]).toContain("page=1");
  expect(completed[0].find((arg) => arg.startsWith("created="))).not.toBe(
    completed[1].find((arg) => arg.startsWith("created=")),
  );
  expect(calls.every((args) => !args.includes("--paginate"))).toBe(true);
});

test("truncated site recovery history fails before declaring handoffs absent", async () => {
  await expect(
    loadSiteWriterRecoveryRuns({
      repository: "MentallyQuill/Tavernary",
      nowMs: AUTOMATION_NOW,
      workflow: "automation-writer.yml",
      gh: async () => JSON.stringify([{ total_count: 50, workflow_runs: [] }]),
    }),
  ).rejects.toThrow("truncated");
});

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
  const fixture = await productionInventoryRoot();
  try {
    const before = execFileSync("git", ["status", "--porcelain"], {
      cwd: fixture.root,
      encoding: "utf8",
    });
    const head = fixture.revision;
    const gh = async (args: string[]) => {
      const path = args.find((arg) => arg.startsWith("repos/"))!;
      if (path.endsWith("/issues") || path.endsWith("/pulls")) return "[[]]";
      if (path.endsWith("/git/ref/heads/main"))
        return JSON.stringify({ object: { sha: head } });
      return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
    };
    const state = await loadAutomationInventory({
      root: fixture.root,
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
      state.operations.some(
        (operation) => operation.identity.kind === "refresh",
      ),
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
      execFileSync("git", ["status", "--porcelain"], {
        cwd: fixture.root,
        encoding: "utf8",
      }),
    ).toBe(before);
  } finally {
    await fixture.cleanup();
  }
}, 30_000);

test("large run inventories read independent pages concurrently within a four-request bound", async () => {
  let active = 0;
  let maximumActive = 0;
  const pages: number[] = [];
  const runs = await loadAutomationWorkerRuns({
    repository: "MentallyQuill/Tavernary",
    nowMs: AUTOMATION_NOW,
    gh: async (args) => {
      const page = Number(
        args.find((arg) => arg.startsWith("page="))!.slice(5),
      );
      pages.push(page);
      active++;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return JSON.stringify([
        {
          total_count: 901,
          workflow_runs: Array.from(
            { length: page === 10 ? 1 : 100 },
            (_, index) => ({
              id: (page - 1) * 100 + index + 1,
              status: "completed",
            }),
          ),
        },
      ]);
    },
  });
  expect(runs).toEqual(
    Array.from({ length: 901 }, (_, index) => ({
      id: index + 1,
      status: "completed",
    })),
  );
  expect(pages).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
  expect(maximumActive).toBeGreaterThan(1);
  expect(maximumActive).toBeLessThanOrEqual(4);
});

test("a concurrent run page exceeding GitHub's result cap rejects the inventory", async () => {
  await expect(
    loadAutomationWorkerRuns({
      repository: "MentallyQuill/Tavernary",
      nowMs: AUTOMATION_NOW,
      gh: async (args) => {
        const page = Number(
          args.find((arg) => arg.startsWith("page="))!.slice(5),
        );
        return JSON.stringify([
          {
            total_count: page === 3 ? 1001 : 500,
            workflow_runs: Array.from({ length: 100 }, (_, i) => ({
              id: (page - 1) * 100 + i + 1,
            })),
          },
        ]);
      },
    }),
  ).rejects.toThrow("changed beyond GitHub's result cap");
});

test("the final worker lookup paginates and refuses truncated filtered inventories", async () => {
  let captured: string[] = [];
  const gh = async (args: string[]) => {
    captured = args;
    return JSON.stringify([
      {
        total_count: 101,
        workflow_runs: args.includes("page=2")
          ? [{ id: 101, status: "completed" }]
          : Array.from({ length: 100 }, (_, index) => ({
              id: index + 1,
              status: "completed",
            })),
      },
    ]);
  };
  expect(
    await loadAutomationWorkerRuns({
      gh,
      repository: "MentallyQuill/Tavernary",
      nowMs: AUTOMATION_NOW,
    }),
  ).toEqual(
    Array.from({ length: 101 }, (_, index) => ({
      id: index + 1,
      status: "completed",
    })),
  );
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

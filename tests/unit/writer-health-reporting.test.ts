import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { runAutomationWriterReconciliation } from "../../scripts/automation/writer-runtime.mjs";
import { assessAutomationHealth } from "../../scripts/automation/health.mjs";
import { planIncidentUpdates } from "../../scripts/automation/incidents.mjs";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
import {
  AUTOMATION_NOW,
  operationFixture,
} from "../helpers/automation-fixtures";

function writerHealthFixture() {
  const operation = operationFixture({
    identity: {
      ...operationFixture().identity,
      kind: "metadata",
      subject: "source:quiet-health-reporting",
    },
    retry: {
      failure: { kind: "unknown", reasonCode: "unclassified-failure" },
      transientAttempts: 3,
      immediateAttempts: 3,
    },
    nextEligibleAt: new Date(AUTOMATION_NOW + 86400000).toISOString(),
  });
  const state: AutomationInventoryState = {
    root: process.cwd(),
    repository: "Owner/Repo",
    publisherActorId: 41,
    nowMs: AUTOMATION_NOW,
    operations: [operation],
    receipts: [
      {
        schema_version: 1,
        operation: structuredClone(operation),
        updatedAt: new Date(AUTOMATION_NOW).toISOString(),
        completedAt: null,
      },
    ],
    local: { revision: "b".repeat(40) },
    remote: { mainHeadSha: "b".repeat(40), issues: [], pulls: [], runs: [] },
  };
  const env = {
    GITHUB_REF: "refs/heads/main",
    GITHUB_REPOSITORY: state.repository,
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_ACTOR_ID: "2625904",
    GITHUB_WORKFLOW_REF: `${state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
    TAVERNARY_PUBLISHER_BOT_ID: "41",
  };
  const earlyPhases = {
    loadEnrichmentRequest: async () => null,
    settleGeneration: async () => ({ slots: 0, consumedKeys: [], failures: 0 }),
    reconcileOwnerRequests: async () => ({
      status: "idle",
      slots: 0,
      consumedKeys: [],
    }),
  };
  return { state, env, earlyPhases, load: async () => structuredClone(state) };
}

test("the production writer reports active health in Actions output and summary without incident writes", async () => {
  const fixture = writerHealthFixture();
  const before = JSON.stringify(fixture.state);
  const directory = await mkdtemp(join(tmpdir(), "tavernary-quiet-health-"));
  const summary = join(directory, "summary.md");
  const gh = vi.fn(async () => {
    throw new Error("No remote health mutation or retry dispatch is expected");
  });
  try {
    const result = await runAutomationWriterReconciliation({
      ...fixture,
      gh,
      env: { ...fixture.env, GITHUB_STEP_SUMMARY: summary },
    });
    expect(gh).not.toHaveBeenCalled();
    expect(result.health).toMatchObject({
      status: "idle",
      findings: expect.arrayContaining([
        expect.objectContaining({ code: "unknown-failure", status: "active" }),
      ]),
    });
    expect(JSON.stringify(result)).toContain("unclassified-failure");
    expect(await readFile(summary, "utf8")).toContain("unknown-failure");
    expect(JSON.stringify(fixture.state)).toBe(before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the production writer retires an obsolete owned incident without claiming recovery", async () => {
  const fixture = writerHealthFixture();
  const create = planIncidentUpdates({
    findings: assessAutomationHealth({
      nowMs: AUTOMATION_NOW,
      budget: { exhausted: true },
    }),
    existingIssues: [],
    publisherActorId: 41,
  })[0];
  const issue = {
    number: 7,
    title: create.title,
    body: create.body,
    state: "open",
    state_reason: null,
    user: { id: 41, login: "publisher[bot]", type: "Bot" },
    labels: [],
  };
  fixture.state.remote.issues.push(
    issue as AutomationInventoryState["remote"]["issues"][number],
  );
  const gh = vi.fn(async (args: string[], input?: string) => {
    if (!args.includes("repos/Owner/Repo/issues/7"))
      throw new Error("Only verified legacy incident retirement is expected");
    if (args.includes("PATCH")) Object.assign(issue, JSON.parse(input!));
    return JSON.stringify(issue);
  });
  const result = await runAutomationWriterReconciliation({ ...fixture, gh });
  expect(result.health).toMatchObject({ status: "closed", number: 7 });
  expect(issue).toMatchObject({ state: "closed", state_reason: "not_planned" });
  expect(gh).toHaveBeenCalledTimes(2);
  expect(JSON.parse(gh.mock.calls[1][1]!)).toEqual({
    state: "closed",
    state_reason: "not_planned",
  });
  const repeated = await runAutomationWriterReconciliation({ ...fixture, gh });
  expect(repeated.health).toMatchObject({ status: "idle" });
  expect(gh).toHaveBeenCalledTimes(2);
});

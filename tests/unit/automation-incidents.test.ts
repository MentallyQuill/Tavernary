import { expect, test } from "vitest";
import { assessAutomationHealth } from "../../scripts/automation/health.mjs";
import {
  planIncidentUpdates,
  reconcileIncidentUpdates,
} from "../../scripts/automation/incidents.mjs";

const finding = () =>
  assessAutomationHealth({
    nowMs: Date.parse("2026-10-08T00:00:00Z"),
    budget: { exhausted: true },
  })[0];
const env = {
  GITHUB_REF: "refs/heads/main",
  GITHUB_REPOSITORY: "Owner/Repo",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_ACTOR_ID: "2625904",
  GITHUB_WORKFLOW_REF:
    "Owner/Repo/.github/workflows/automation-writer.yml@refs/heads/main",
};

test("incidents deduplicate, preserve owner edits and close only observed recovery", () => {
  const input = {
    findings: [finding()],
    existingIssues: [],
    publisherActorId: 41,
  };
  const create = planIncidentUpdates(input)[0];
  const issue = {
    number: 7,
    title: create.title,
    body: create.body,
    state: "open",
    user: { id: 41, type: "Bot" },
  };
  expect(
    planIncidentUpdates({ ...input, existingIssues: [issue] }),
  ).toHaveLength(0);
  expect(
    planIncidentUpdates({ ...input, findings: [], existingIssues: [issue] }),
  ).toHaveLength(0);
  expect(
    planIncidentUpdates({
      ...input,
      existingIssues: [{ ...issue, body: issue.body + "\nOwner note" }],
    }),
  ).toHaveLength(0);
  const close = planIncidentUpdates({
    ...input,
    findings: [{ ...finding(), status: "recovered" as const }],
    existingIssues: [issue],
  });
  expect(close).toMatchObject([{ action: "close", number: 7 }]);
  expect(
    planIncidentUpdates({
      ...input,
      existingIssues: [
        { ...issue, state: "closed", state_reason: "not_planned" },
      ],
    }),
  ).toHaveLength(0);
  expect(
    planIncidentUpdates({
      ...input,
      existingIssues: [
        { ...issue, state: "closed", closed_by: { id: 2625904, type: "User" } },
      ],
    }),
  ).toHaveLength(0);
  expect(
    planIncidentUpdates({
      ...input,
      existingIssues: [{ ...issue, user: { id: 99, type: "Bot" } }],
    })[0].action,
  ).toBe("create");
});

test("native incident creation recovers a lost response without a duplicate or repeated comments", async () => {
  const calls: Array<{ args: string[]; body?: string }> = [];
  const issues: Array<{
    number: number;
    title: string;
    body: string;
    state: string;
    user: { id: number; type: string };
  }> = [];
  let lost = true;
  const gh = async (args: string[], body?: string) => {
    calls.push({ args, body });
    if (args.includes("POST")) {
      const payload = JSON.parse(body!);
      const issue = {
        number: 7,
        title: payload.title,
        body: payload.body,
        state: "open",
        user: { id: 41, type: "Bot" },
      };
      issues.push(issue);
      if (lost) {
        lost = false;
        throw new Error("Connection lost after creation");
      }
      return JSON.stringify(issue);
    }
    if (args.includes("PATCH")) {
      const payload = JSON.parse(body!);
      Object.assign(issues[0], payload);
      return JSON.stringify(issues[0]);
    }
    return JSON.stringify(issues[0]);
  };
  const load = async () => ({
    findings: [finding()],
    existingIssues: issues,
    publisherActorId: 41,
  });
  await expect(reconcileIncidentUpdates({ env, gh, load })).rejects.toThrow();
  expect((await reconcileIncidentUpdates({ env, gh, load })).status).toBe(
    "idle",
  );
  expect(calls.filter((call) => call.args.includes("POST"))).toHaveLength(1);
  expect(
    calls.some((call) => call.args.some((arg) => arg.endsWith("/comments"))),
  ).toBe(false);
  const recovered = async () => ({
    findings: [{ ...finding(), status: "recovered" as const }],
    existingIssues: issues,
    publisherActorId: 41,
  });
  expect(
    (await reconcileIncidentUpdates({ env, gh, load: recovered })).status,
  ).toBe("closed");
  expect(issues[0].state).toBe("closed");
});

test("exhausted allowance and changed owner authority produce no incident writes", async () => {
  let writes = 0;
  const gh = async () => {
    writes++;
    throw new Error("No API permitted");
  };
  const load = async () => ({
    findings: [finding()],
    existingIssues: [],
    publisherActorId: 41,
  });
  expect(
    (await reconcileIncidentUpdates({ env, gh, load, availableSlots: 0 }))
      .status,
  ).toBe("waiting");
  expect(writes).toBe(0);
  let loads = 0;
  expect(
    (
      await reconcileIncidentUpdates({
        env,
        gh,
        load: async () => ({
          findings: ++loads === 1 ? [finding()] : [],
          existingIssues: [],
          publisherActorId: 41,
        }),
      })
    ).status,
  ).toBe("superseded");
  expect(writes).toBe(0);
});

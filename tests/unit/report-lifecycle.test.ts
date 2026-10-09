import { expect, test } from "vitest";
import { projectAutomationLifecycle } from "../../scripts/automation/lifecycle-github.mjs";
import { discoverReportOperations } from "../../scripts/automation/report-operations.mjs";
import { reportInventoryFixture } from "../helpers/automation-fixtures";
import {
  quarantineTavernKeeperReport,
  reportSynthesisIncidentKey,
} from "../../scripts/security/tavernkeeper-import-state.mjs";
import { TAVERNKEEPER_SYNTHESIS_POLICY_VERSION } from "../../scripts/security/tavernkeeper-assessment-contract.mjs";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";

function fixture(loseCreate = false) {
  const input = reportInventoryFixture();
  const entry = input.reportIndex.reports[0];
  const importState = quarantineTavernKeeperReport(
    input.importState,
    entry,
    TAVERNKEEPER_SYNTHESIS_POLICY_VERSION,
    "budget-exhausted",
    new Date(input.nowMs).toISOString(),
  );
  const operation = {
    ...discoverReportOperations(input)[0],
    stage: "deployment-confirmed" as const,
    expectedSha: "d".repeat(40),
  };
  const state: AutomationInventoryState = {
    root: process.cwd(),
    repository: "MentallyQuill/Tavernary",
    publisherActorId: 41982982,
    nowMs: input.nowMs,
    operations: [operation],
    receipts: [],
    remote: {
      issues: [],
      pulls: [],
      runs: [],
      mainHeadSha: operation.expectedSha,
    },
    local: {
      revision: operation.expectedSha,
      sources: input.registry,
      reportIndex: input.reportIndex,
      importState,
    },
  };
  const marker = `Report incident key: \`${reportSynthesisIncidentKey(entry.report_digest, TAVERNKEEPER_SYNTHESIS_POLICY_VERSION)}\``;
  type Notice = {
    number: number;
    title: string;
    body: string;
    user: { id: number; type: string };
    labels: string[];
    state: string;
    state_reason: string | null;
  };
  const notices: Notice[] = [
    {
      number: 501,
      title: "[tavernkeeper-import] narrative enrichment fallback",
      body: marker,
      user: { id: 99, type: "Bot" },
      labels: ["tavernkeeper-import"],
      state: "open",
      state_reason: null,
    },
  ];
  const writes: string[] = [];
  let interrupted = false;
  const gh = async (args: string[], stdin?: string) => {
    const path = args.find((value) => value.startsWith("repos/"))!;
    const method = args.includes("--method")
      ? args[args.indexOf("--method") + 1]
      : "GET";
    if (method === "GET") {
      if (path.includes("/issues?")) return JSON.stringify(notices);
      if (path.endsWith("/labels/tavernkeeper-import"))
        return JSON.stringify({ name: "tavernkeeper-import" });
      const found = notices.find((value) =>
        path.endsWith(`/issues/${value.number}`),
      );
      if (found) return JSON.stringify(found);
      throw new Error(`Unexpected report lifecycle read ${path}`);
    }
    writes.push(`${method} ${path}`);
    const payload = JSON.parse(stdin ?? "{}");
    if (method === "POST" && path.endsWith("/issues")) {
      const created = {
        number: 502,
        ...payload,
        user: { id: state.publisherActorId, type: "Bot" },
        state: "open",
        state_reason: null,
      };
      notices.push(created);
      if (loseCreate && !interrupted) {
        interrupted = true;
        throw new Error("Provider response interrupted after issue creation");
      }
      return JSON.stringify(created);
    }
    const found = notices.find((value) =>
      path.endsWith(`/issues/${value.number}`),
    );
    if (method === "PATCH" && found) {
      Object.assign(found, payload);
      return JSON.stringify(found);
    }
    throw new Error(`Unexpected report lifecycle mutation ${path}`);
  };
  const adapter = {
    operation,
    state,
    gh,
    load: async () => state,
    commit: async () => {
      throw new Error("Report notices do not republish canonical data");
    },
  };
  return { adapter, notices, writes, importState };
}

test("canonical report fallback creates one numeric-owned incident, replays quietly and resolves only its owned notice", async () => {
  const input = fixture();
  expect(await projectAutomationLifecycle(input.adapter)).toEqual({
    status: "complete",
  });
  expect(input.writes.filter((value) => value.startsWith("POST"))).toHaveLength(
    1,
  );
  const before = [...input.writes];
  expect(await projectAutomationLifecycle(input.adapter)).toEqual({
    status: "complete",
  });
  expect(input.writes).toEqual(before);
  input.adapter.state.local.importState = {
    ...input.importState,
    quarantines: [],
  };
  expect(await projectAutomationLifecycle(input.adapter)).toEqual({
    status: "complete",
  });
  expect(input.notices[0].state).toBe("open");
  expect(input.notices[1]).toMatchObject({
    state: "closed",
    state_reason: "completed",
  });
});

test("lost report incident creation is recovered without a second issue or repeated comment", async () => {
  const input = fixture(true);
  await expect(projectAutomationLifecycle(input.adapter)).rejects.toThrow(
    /interrupted/u,
  );
  expect(await projectAutomationLifecycle(input.adapter)).toEqual({
    status: "complete",
  });
  expect(input.writes.filter((value) => value.startsWith("POST"))).toHaveLength(
    1,
  );
});

test("report incidents preserve explicit owner dismissal and never use stale publication authority", async () => {
  const input = fixture();
  await projectAutomationLifecycle(input.adapter);
  input.notices[1].state = "closed";
  input.notices[1].state_reason = "not_planned";
  const before = [...input.writes];
  expect(await projectAutomationLifecycle(input.adapter)).toEqual({
    status: "complete",
  });
  expect(input.writes).toEqual(before);
  input.adapter.state.operations = [];
  expect(await projectAutomationLifecycle(input.adapter)).toEqual({
    status: "superseded",
  });
  expect(input.writes).toEqual(before);
});

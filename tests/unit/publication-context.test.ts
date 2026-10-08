import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { expect, test } from "vitest";
import { createPreparedPublicationContext } from "../../scripts/automation/publication-context.mjs";
import { discoverCatalogOperations } from "../../scripts/automation/catalog-operations.mjs";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
import project from "../../data/registry/projects/mentallyquill-recursion.json";
import { createPolicyEvidenceFingerprint } from "../../scripts/moderation/catalog-policy-review-contract.mjs";

function currentState(): AutomationInventoryState {
  const source = JSON.parse(
    readFileSync(`data/registry/sources/${project.source_id}.json`, "utf8"),
  );
  const snapshot = JSON.parse(
    readFileSync(`data/snapshots/github/${project.source_id}.json`, "utf8"),
  );
  const local = {
    projects: [structuredClone(project)],
    sources: [source],
    snapshots: [snapshot],
    revision: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    advisoryState: [],
    metadataState: [],
  };
  const operations = discoverCatalogOperations({
    catalog: {
      projects: local.projects,
      sources: local.sources,
      revision: local.revision,
    },
    evidence: local.snapshots,
    advisoryState: [],
    metadataState: [],
    receipts: [],
    nowMs: Date.parse("2026-10-08T12:00:00Z"),
  });
  return {
    root: process.cwd(),
    repository: "MentallyQuill/Tavernary",
    publisherActorId: 41_982_982,
    nowMs: Date.parse("2026-10-08T12:00:00Z"),
    local,
    operations,
    receipts: [],
    remote: { issues: [], pulls: [], runs: [], mainHeadSha: local.revision },
  };
}
test("refresh publication uses the real snapshot schema and immutable numeric source identity", async () => {
  const state = currentState();
  const operation = state.operations.find(
    (operation) => operation.identity.kind === "refresh",
  )!;
  const context = await createPreparedPublicationContext({ state, operation });
  const snapshot = (
    state.local.snapshots as Array<{ repository: { id: number } }>
  )[0];
  const path = `data/snapshots/github/${project.source_id}.json`;
  expect(context.source.identity).toBe(`github:${snapshot.repository.id}`);
  expect(context.validateContent(path, snapshot)).toBe(true);
  expect(context.fileDigests[path]).toMatch(/^[a-f0-9]{64}$/u);
  expect(
    context.validateContent(path, {
      ...snapshot,
      repository: { ...snapshot.repository, id: 42 },
    }),
  ).toBe(false);
  expect(
    context.validateContent(path, { ...snapshot, injected: "command" }),
  ).toBe(false);
});
test("metadata can change automatic copy while protecting authority and unrelated fields", async () => {
  const state = currentState();
  const operation = state.operations.find(
    (operation) => operation.identity.kind === "metadata",
  )!;
  const context = await createPreparedPublicationContext({ state, operation });
  const path = `data/registry/projects/${project.id}.json`;
  expect(
    context.validateContent(path, {
      ...project,
      summary: "A verified factual summary.",
    }),
  ).toBe(true);
  expect(
    context.validateContent(path, {
      ...project,
      summary: "A verified factual summary.",
      listing_status: "retired",
    }),
  ).toBe(false);
  expect(
    context.validateContent(path, {
      ...project,
      summary: "A verified factual summary.",
      source_id: "github-42",
    }),
  ).toBe(false);
});
test("manual summary remains protected independently from automatic tags", async () => {
  const state = currentState();
  const record = (state.local.projects as (typeof project)[])[0];
  record.metadata_policy.summary = {
    mode: "manual",
    note: "Verified repository owner selection.",
  } as typeof record.metadata_policy.summary;
  state.operations = discoverCatalogOperations({
    catalog: {
      projects: [record],
      sources: state.local.sources as never,
      revision: "b".repeat(40),
    },
    evidence: state.local.snapshots as never,
    advisoryState: [],
    metadataState: [],
    receipts: [],
    nowMs: state.nowMs,
  });
  const operation = state.operations.find(
    (operation) => operation.identity.kind === "metadata",
  )!;
  const context = await createPreparedPublicationContext({ state, operation });
  const path = `data/registry/projects/${record.id}.json`;
  expect(
    context.validateContent(path, {
      ...record,
      tags: ["guide-model-responses"],
    }),
  ).toBe(true);
  expect(
    context.validateContent(path, {
      ...record,
      summary: "Overwritten manual summary.",
    }),
  ).toBe(false);
});
test("source deletion or an unrecognized current operation prevents result admission", async () => {
  const state = currentState();
  const operation = state.operations[0];
  state.local.sources = [];
  await expect(
    createPreparedPublicationContext({ state, operation }),
  ).rejects.toThrow();
  const fresh = currentState();
  fresh.operations = [];
  await expect(
    createPreparedPublicationContext({ state: fresh, operation }),
  ).rejects.toThrow();
});

test("preparation can use its pinned main base while the writer demands current main", async () => {
  const state = currentState();
  const operation = state.operations[0];
  state.remote.mainHeadSha = "d".repeat(40);
  await expect(
    createPreparedPublicationContext({ state, operation }),
  ).rejects.toThrow();
  const context = await createPreparedPublicationContext({
    state,
    operation,
    preparation: true,
  });
  expect(context.mainSha).toBe(state.local.revision);
});
test("an advisory artifact cannot redirect notice bookkeeping to an unrelated issue", async () => {
  const state = currentState();
  const operation = state.operations.find(
    (operation) => operation.identity.kind === "advisory",
  )!;
  const context = await createPreparedPublicationContext({ state, operation });
  const snapshot = (
    state.local.snapshots as Array<{ repository: { head_sha: string } }>
  )[0];
  const value = {
    schema_version: 1,
    project_id: project.id,
    source_id: project.source_id,
    source_identity: "github:mentallyquill/recursion",
    evidence_fingerprint: createPolicyEvidenceFingerprint({
      projectId: project.id,
      sourceId: project.source_id,
      headSha: snapshot.repository.head_sha,
      policyVersion: operation.identity.policyVersion,
    }),
    policy_version: operation.identity.policyVersion,
    status: "review-suggested",
    category: "potential-other-catalog-policy-conflict",
    reviewed_at: "2026-10-08T12:00:00Z",
    retry: { attempts: 0, last_failure_at: null },
    maintenance_issue_number: null,
  };
  const path = `data/snapshots/policy-review/${project.id}.json`;
  expect(context.validateContent(path, value)).toBe(true);
  expect(
    context.validateContent(path, {
      ...value,
      maintenance_issue_number: 999_999,
    }),
  ).toBe(false);
});

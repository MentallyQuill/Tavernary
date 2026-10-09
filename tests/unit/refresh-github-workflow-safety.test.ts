import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test } from "vitest";
import { parse } from "yaml";

const refreshPath = resolve(".github/workflows/refresh-catalog.yml");
const workflowDirectory = resolve(".github/workflows");

async function workflowSource(name: string) {
  return readFile(resolve(workflowDirectory, `${name}.yml`), "utf8");
}

test("uses status-driven refresh modes without indexed backfill", async () => {
  const source = await readFile(refreshPath, "utf8");

  expect(source).not.toContain("start_index");
  expect(source).not.toContain("next_index");
  expect(source).not.toContain("< 200");
  const document = parse(source);
  expect(document.on.workflow_dispatch.inputs.mode.options).toEqual([
    "incremental",
    "baseline",
    "project",
    "forensic",
  ]);
  expect(document.on.workflow_dispatch.inputs.batch_size.default).toBe(12);
});

test("keeps refresh preparation read-only and retains a bounded result", async () => {
  const source = await readFile(refreshPath, "utf8");
  const document = parse(source);
  expect(document.permissions).toEqual({
    contents: "read",
    actions: "read",
    issues: "read",
  });
  expect(document.jobs.prepare.permissions).toEqual({
    contents: "read",
    actions: "read",
    issues: "read",
    "pull-requests": "read",
  });
  expect(source).not.toMatch(/git (?:add|commit|push|rebase)\b/);
  expect(source).toContain(
    "node scripts/automation/catalog-preparation-cli.mjs",
  );
  expect(source).toContain("automation-prepared-${{ inputs.operation_key }}");
  expect(source).toContain("if-no-files-found: error");
});

test("selects current authority before creating the dispatch credential", async () => {
  const source = await readFile(refreshPath, "utf8");
  const select = source.indexOf(
    "node scripts/automation/preparation-request.mjs",
  );
  const credential = source.indexOf("Create fresh preparation dispatch token");
  const dispatch = source.indexOf("gh workflow run refresh-catalog.yml");
  expect(select).toBeGreaterThan(-1);
  expect(select).toBeLessThan(credential);
  expect(credential).toBeLessThan(dispatch);
  expect(source).toContain("steps.request.outputs.requests != '0'");
  expect(source).toContain("permission-actions: write");
  expect(source).not.toContain("permission-contents: write");
  expect(source).not.toContain("workflow run deploy-pages.yml");
});

test("pins preparation code and guards refresh requests by current authority", async () => {
  const source = await readFile(refreshPath, "utf8");

  expect(source).toContain("github.ref == 'refs/heads/main'");
  expect(source).toContain("github.actor_id == 2625904");
  expect(source).toContain(
    "github.actor_id == vars.TAVERNARY_PUBLISHER_BOT_ID",
  );
  expect(source).not.toContain("github.actor_id == 41898282");
  expect(source).toContain("fetch-depth: 0");
  expect(source).toContain("persist-credentials: false");
  expect(source).toContain("ref: ${{ github.sha }}");
  expect(source).not.toMatch(/git (?:push|rebase)\b/);
});

test("dispatches immutable preparations with bounded native source selection", async () => {
  const source = await readFile(refreshPath, "utf8");
  const planner = await readFile(
    resolve("scripts/automation/preparation-request.mjs"),
    "utf8",
  );
  expect(planner).toContain(
    "selectRefreshSources(state.local.sources, state.local.snapshots",
  );
  expect(planner).toContain("limit: 20");
  expect(source).not.toContain("while (( remaining > 0 )); do");
  expect(source).not.toContain("baseline-queue.mjs evaluate");
  expect(source).toContain('-f operation_key="$operation_key"');
  expect(source).toContain(
    "catalog-refresh-${{ inputs.operation_key || 'request' }}",
  );
});

test("names catalog runs by their actual operating mode", async () => {
  const source = await readFile(refreshPath, "utf8");

  expect(source).toContain("run-name:");
  expect(source).toContain("scheduled incremental");
  expect(source).toContain("Catalog: Refresh baseline queue");
  expect(source).toContain("inputs.batch_size");
});

test("enrichment exposes model credentials only to one budgeted read-only preparation step", async () => {
  const text = await workflowSource("enrich-catalog");
  const document = parse(text);
  const credentialSteps = document.jobs.prepare.steps.filter(
    (step: { env?: Record<string, string> }) => step.env?.UTILITY_API_KEY,
  );
  expect(credentialSteps.map((step: { name: string }) => step.name)).toEqual([
    "Prepare one operation with reserved model allowance",
  ]);
  expect(text.match(/secrets\.UTILITY_API_KEY/gu)).toHaveLength(1);
  expect(text.match(/secrets\.TAVERNARY_ENRICHMENT_API_KEY/gu)).toHaveLength(1);
  expect(credentialSteps[0].env.TAVERNARY_REQUIRE_MODEL_BUDGET).toBe("true");
  expect(document.jobs.prepare["timeout-minutes"]).toBe(45);
  expect(document.jobs.prepare.permissions).toEqual({
    contents: "read",
    actions: "read",
    issues: "read",
    "pull-requests": "read",
  });
  expect(document.jobs.prepare.steps[0].with).toMatchObject({
    ref: "${{ github.sha }}",
    "persist-credentials": false,
  });
  expect(document.concurrency).toEqual({
    group: "catalog-enrichment-preparation",
    "cancel-in-progress": false,
  });
  const request = await workflowSource("request-catalog-enrichment");
  expect(request).not.toContain("secrets.");
  expect(text).not.toMatch(
    /catalog:enrichment-rollout|catalog:report-enrichment-errors|git push|permission-contents/u,
  );
});
test("identity backfill delegates optional IDs to the shared writer", async () => {
  const text = await workflowSource("backfill-repository-identities");
  const document = parse(text) as {
    concurrency: { group: string };
    jobs: Record<string, { steps: Array<{ run?: string }> }>;
  };
  const commands = Object.values(document.jobs)
    .flatMap(({ steps }) => steps)
    .map(({ run }) => run)
    .filter(Boolean)
    .join("\n");
  expect(document.concurrency.group).toBe("identity-backfill-request");
  expect(commands).toContain("automation-writer.yml --ref main");
  expect(commands).toContain("mode=backfill-identities");
  expect(commands).toContain('source_ids="$SOURCE_IDS"');
  expect(commands).not.toMatch(/git (?:add|commit|push|rebase)/u);
  expect(text).not.toContain("data/reports/enrichment-report.json");
  expect(text).not.toContain("workflow run enrich-catalog.yml");
});

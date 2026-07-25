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
  expect(source).toContain("-f mode=baseline");
});

test("stages only snapshots and the refresh manifest", async () => {
  const source = await readFile(refreshPath, "utf8");

  expect(source).toContain("git add data/snapshots/github/*.json");
  expect(source).toContain("data/snapshots/github-refresh.json");
  expect(source).not.toMatch(/git add (?:data\/registry|data\/catalog)/);
});

test("validates before commit and deploys only after a committed change", async () => {
  const source = await readFile(refreshPath, "utf8");
  const check = source.indexOf("npm run check");
  const commit = source.indexOf('git commit -m "chore(catalog)');
  const deploy = source.indexOf("workflow run deploy-pages.yml");

  expect(check).toBeGreaterThan(-1);
  expect(check).toBeLessThan(commit);
  expect(commit).toBeLessThan(deploy);
  expect(source).toContain("steps.commit.outputs.changed == 'true'");
});

test("rebases with bounded retries and never force-pushes", async () => {
  const source = await readFile(refreshPath, "utf8");

  expect(source).toContain(
    "if: github.event_name == 'schedule' || github.ref == 'refs/heads/main'",
  );
  expect(source).toContain("fetch-depth: 0");
  expect(source).toContain("for attempt in 1 2 3");
  expect(source).toContain("git fetch origin main");
  expect(source).toContain("git rebase origin/main");
  expect(source).toContain("git rebase --abort || true");
  expect(source).not.toMatch(/push[^\n]*(?:--force|-f\b)/);
  const rebase = source.indexOf("git rebase origin/main");
  const postRebaseCheck = source.indexOf("npm run check", rebase);
  const push = source.indexOf("git push origin HEAD:main", rebase);
  expect(postRebaseCheck).toBeGreaterThan(rebase);
  expect(postRebaseCheck).toBeLessThan(push);
});

test("continues baselines only after measurable progress", async () => {
  const source = await readFile(refreshPath, "utf8");
  const capture = source.indexOf("Capture baseline queue state");
  const refresh = source.indexOf("Refresh selected sources");
  const evaluate = source.indexOf("Evaluate baseline queue progress");
  const dispatch = source.indexOf("Dispatch next baseline batch");

  expect(capture).toBeGreaterThan(-1);
  expect(capture).toBeLessThan(refresh);
  expect(refresh).toBeLessThan(evaluate);
  expect(evaluate).toBeLessThan(dispatch);
  expect(source).toContain("baseline-queue.mjs capture");
  expect(source).toContain("baseline-queue.mjs evaluate");
  expect(source).toContain(
    "steps.baseline-progress.outputs.continue == 'true'",
  );
  expect(source).toContain("steps.baseline-progress.outputs.remaining");
  expect(source).not.toContain("if (( remaining > 0 ))");
});

test("names catalog runs by their actual operating mode", async () => {
  const source = await readFile(refreshPath, "utf8");

  expect(source).toContain("run-name:");
  expect(source).toContain("scheduled incremental");
  expect(source).toContain("Baseline queue");
  expect(source).toContain("inputs.batch_size");
});

test("enrichment prepares a random canary and limits batch publication", async () => {
  const text = await workflowSource("enrich-catalog");
  const document = parse(text) as {
    jobs: Record<string, { steps: Array<{ run?: string }> }>;
    concurrency: { group: string };
    on: {
      workflow_dispatch: {
        inputs: Record<string, { options?: string[]; default?: unknown }>;
      };
    };
  };
  const commands = Object.values(document.jobs).flatMap((job) =>
    job.steps.flatMap((step) => (step.run ? [step.run] : [])),
  );
  expect(text).toContain("data/registry/projects/*.json");
  expect(text).toContain("data/reports/enrichment-report.json");
  expect(text).toContain("publish_canary_preparation()");
  expect(document.on.workflow_dispatch.inputs.mode.options).toEqual([
    "preflight",
    "canary",
    "start",
    "resume",
  ]);
  expect(document.on.workflow_dispatch.inputs).not.toHaveProperty(
    "start_index",
  );
  expect(document.on.workflow_dispatch.inputs).not.toHaveProperty("force");
  expect(text).toContain(
    "Optional newline-separated project IDs; empty randomly selects five.",
  );
  expect(text).toContain("npm run --silent catalog:select-canary");
  expect(text).toContain('existing_status" == "running"');
  expect(text).toContain("jq -r '.manifest[]'");
  expect(text).toContain("npm run catalog:refresh -- \\");
  expect(text).toContain("--mode project");
  expect(text).toContain('--project-id "$project_id"');
  expect(text).toContain("npm run catalog:backfill-identities");
  expect(text).toContain("data/snapshots/github/*.json");
  expect(text).toContain("data/snapshots/github-refresh.json");
  expect(text).toContain('args+=(--project-id "$project_id")');
  expect(text).toContain("while IFS= read -r project_id");
  expect(text.match(/secrets\.TAVERNARY_ENRICHMENT_API_KEY/gu)).toHaveLength(1);
  expect(text).toContain("npm run catalog:enrich -- --mode preflight");
  expect(text).toContain("## Enrichment provider preflight");
  expect(text).not.toContain("## MiniMax M3 preflight");
  expect(text).toContain('"$MODE" == "canary"');
  expect(text).toContain('test "$run_mode" = "full"');
  expect(text).not.toContain("workflow run enrich-catalog.yml");
  expect(text).toContain("workflow run deploy-pages.yml");
  expect(text).toContain("--mode approve-canary");
  expect(text).toContain('"$status" != "awaiting-deployment"');
  expect(text).toContain('while [[ "$status" == "running" ]]');
  expect(text).toContain("GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}");
  expect(text).toContain("REGISTRY_CHANGED=true");
  expect(text).toContain("gh run watch");
  const deploy = text.indexOf("gh workflow run deploy-pages.yml");
  const watch = text.indexOf("gh run watch", deploy);
  const approve = text.indexOf("--mode approve-canary", watch);
  expect(deploy).toBeGreaterThan(-1);
  expect(watch).toBeGreaterThan(deploy);
  expect(approve).toBeGreaterThan(watch);
  expect(text).toContain("timeout-minutes: 300");
  expect(commands.join("\n")).toContain("npm run check");
  const runBatch = text.indexOf("run_batch()");
  const enrich = text.indexOf("npm run catalog:enrich", runBatch);
  const check = text.indexOf("npm run check", enrich);
  const publish = text.indexOf('publish_changes "chore(catalog)', check);
  expect(runBatch).toBeGreaterThan(-1);
  expect(enrich).toBeGreaterThan(runBatch);
  expect(check).toBeGreaterThan(enrich);
  expect(publish).toBeGreaterThan(check);
  expect(document.concurrency.group).toBe("catalog-refresh");
  expect(
    (
      parse(await workflowSource("refresh-catalog")) as {
        concurrency: { group: string };
      }
    ).concurrency.group,
  ).toBe("catalog-refresh");
});

test("identity backfill targets optional IDs and owns only repository identity writes", async () => {
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

  expect(document.concurrency.group).toBe("catalog-refresh");
  expect(text).toContain("while IFS= read -r project_id");
  expect(text).toContain('args+=(--project-id "$project_id")');
  expect(commands).toContain("npm run catalog:backfill-identities");
  expect(commands).toContain("npm run catalog:validate");
  expect(text).toContain("git add data/registry/projects/*.json");
  expect(text).not.toMatch(/git add .*data\/snapshots/);
  expect(text).not.toContain("data/reports/enrichment-report.json");
  expect(text).not.toContain("workflow run enrich-catalog.yml");
});

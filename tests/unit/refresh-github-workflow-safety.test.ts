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
  expect(source).toContain('"$MODE" != "baseline"');
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

test("runs one bounded baseline batch so activity cursors persist between runs", async () => {
  const source = await readFile(refreshPath, "utf8");
  expect(source).toContain(
    "Advance baseline queue or refresh selected sources",
  );
  expect(source).not.toContain("while (( remaining > 0 )); do");
  expect(source).not.toContain("baseline-queue.mjs evaluate");
  expect(source.match(/\brefresh_batch\b/gu)).toHaveLength(3);
  expect(source).not.toContain("workflow run refresh-catalog.yml");
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
  for (const [functionName, nextFunction] of [
    ["publish_changes()", "publish_canary_preparation()"],
    ["publish_canary_preparation()", "choose_canary_projects()"],
  ]) {
    const start = text.indexOf(functionName);
    const end = text.indexOf(nextFunction, start + functionName.length);
    const body = text.slice(start, end);
    expect(body).toMatch(/if ! npm run check; then\s+exit 1\s+fi/u);
    expect(body).not.toMatch(/npm run check &&\s+git push/u);
  }
  expect(document.concurrency.group).toBe("catalog-refresh");
  expect(
    (
      parse(await workflowSource("refresh-catalog")) as {
        concurrency: { group: string };
      }
    ).concurrency.group,
  ).toBe("catalog-refresh");
});

test("completes canary retries before publishing and deploying", async () => {
  const source = await workflowSource("enrich-catalog");
  const start = source.indexOf("complete_canary()");
  const end = source.indexOf("resume_batch()", start);
  const body = source.slice(start, end);
  const firstBatch = body.indexOf("run_batch canary false");
  const retryLoop = body.indexOf('while [[ "$status" == "running" ]]');
  const retryBatch = body.indexOf("run_batch canary false", firstBatch + 1);
  const check = body.indexOf("npm run check", retryBatch);
  const publish = body.indexOf(
    'publish_changes "chore(catalog): enrich project metadata"',
    check,
  );
  const deploy = body.indexOf("deploy_registry_changes", publish);

  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  expect(firstBatch).toBeGreaterThan(-1);
  expect(retryLoop).toBeGreaterThan(firstBatch);
  expect(retryBatch).toBeGreaterThan(retryLoop);
  expect(check).toBeGreaterThan(retryBatch);
  expect(publish).toBeGreaterThan(check);
  expect(deploy).toBeGreaterThan(publish);
  expect(body).toContain("Enrichment stalled");

  const canaryBranch = source.slice(
    source.indexOf('if [[ "$MODE" == "canary" ]]'),
    source.indexOf('if [[ "$MODE" == "start" ]]'),
  );
  expect(canaryBranch).toContain("complete_canary");
  expect(canaryBranch).not.toContain("run_batch canary");
});

test("fails an enrichment resume when its cursor state does not advance", async () => {
  const source = await workflowSource("enrich-catalog");
  const resumeFunction = source.indexOf("resume_batch()");
  const before = source.indexOf(
    'progress_before="$(enrichment_progress)"',
    resumeFunction,
  );
  const resume = source.indexOf("run_batch resume", before);
  const after = source.indexOf(
    'progress_after="$(enrichment_progress)"',
    resume,
  );
  const guard = source.indexOf(
    '"$progress_after" == "$progress_before"',
    after,
  );

  expect(source).toContain("enrichment_progress()");
  expect(resumeFunction).toBeGreaterThan(-1);
  expect(before).toBeGreaterThan(resumeFunction);
  expect(resume).toBeGreaterThan(before);
  expect(after).toBeGreaterThan(resume);
  expect(guard).toBeGreaterThan(after);
  expect(source).toContain("Enrichment stalled");
  expect(source).not.toContain('run_batch "$MODE"');
  expect(source.match(/\bresume_batch\b/gu)).toHaveLength(3);
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

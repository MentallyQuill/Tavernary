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
  expect(source).toContain("git add data/snapshots/codeberg/*.json");
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

  expect(source).toContain("github.ref == 'refs/heads/main'");
  expect(source).toContain("github.actor_id == 2625904");
  expect(source).toContain(
    "github.actor_id == vars.TAVERNARY_PUBLISHER_BOT_ID",
  );
  expect(source).not.toContain("github.actor_id == 41898282");
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
  expect(source).toContain("Catalog: Refresh baseline queue");
  expect(source).toContain("inputs.batch_size");
});

test("enrichment delegates one durable rollout to the tested orchestrator", async () => {
  const text = await workflowSource("enrich-catalog");
  const document = parse(text) as {
    jobs: Record<
      string,
      {
        steps: Array<{
          name?: string;
          run?: string;
          env?: Record<string, string>;
        }>;
      }
    >;
    concurrency: { group: string; "cancel-in-progress": boolean };
    on: {
      workflow_dispatch: {
        inputs: Record<string, unknown>;
      };
    };
  };
  const steps = Object.values(document.jobs).flatMap(({ steps }) => steps);
  const rollout = steps.find(
    ({ name }) => name === "Run durable enrichment rollout",
  );
  const reporter = steps.find(
    ({ name }) => name === "Report unresolved enrichment projects",
  );

  expect(document.on.workflow_dispatch.inputs).not.toHaveProperty("mode");
  expect(document.on.workflow_dispatch.inputs).not.toHaveProperty(
    "project_ids",
  );
  expect(rollout?.run?.trim()).toBe("npm run catalog:enrichment-rollout");
  expect(rollout?.env).toMatchObject({
    UTILITY_API_ENDPOINT: "${{ secrets.UTILITY_API_ENDPOINT }}",
    UTILITY_API_KEY: "${{ secrets.UTILITY_API_KEY }}",
    UTILITY_MODEL: "${{ secrets.UTILITY_MODEL }}",
    TAVERNARY_ENRICHMENT_API_URL: "${{ secrets.TAVERNARY_ENRICHMENT_API_URL }}",
    TAVERNARY_ENRICHMENT_API_KEY: "${{ secrets.TAVERNARY_ENRICHMENT_API_KEY }}",
    TAVERNARY_ENRICHMENT_MODEL: "${{ secrets.TAVERNARY_ENRICHMENT_MODEL }}",
    GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}",
    GH_TOKEN: "${{ secrets.GITHUB_TOKEN }}",
  });
  expect(text.match(/secrets\.UTILITY_API_KEY/gu)).toHaveLength(1);
  expect(text.match(/secrets\.TAVERNARY_ENRICHMENT_API_KEY/gu)).toHaveLength(1);
  expect(reporter?.env).toEqual({
    GH_TOKEN: "${{ secrets.GITHUB_TOKEN }}",
  });
  expect(reporter?.run).toContain("enrichment-rollout-result.json");
  expect(text).toContain("## Enrichment provider preflight");
  expect(text).not.toContain("publish_changes()");
  expect(text).not.toContain("complete_canary()");
  expect(text).not.toContain("finish_full_rollout()");
  expect(text).toContain("timeout-minutes: 300");
  expect(document.concurrency).toEqual({
    group: "catalog-refresh",
    "cancel-in-progress": false,
  });
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
  expect(text).toContain("while IFS= read -r source_id");
  expect(text).toContain('args+=(--source-id "$source_id")');
  expect(commands).toContain("npm run catalog:backfill-identities");
  expect(commands).toContain("npm run catalog:validate");
  expect(text).toContain("git add data/registry/sources/*.json");
  expect(text).not.toMatch(/git add .*data\/snapshots/);
  expect(text).not.toContain("data/reports/enrichment-report.json");
  expect(text).not.toContain("workflow run enrich-catalog.yml");
});

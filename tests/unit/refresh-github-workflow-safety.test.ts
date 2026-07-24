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
  expect(source).toContain("counts.provisional");
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

test("continues baselines only after successful publication", async () => {
  const source = await readFile(refreshPath, "utf8");

  expect(source).toContain("success() && inputs.mode == 'baseline'");
  expect(source).toContain("counts.provisional");
  expect(source).toContain("if (( remaining > 0 ))");
  expect(source).toContain('-f batch_size="$BATCH_SIZE"');
});

test("enrichment stages only registry records and report after the command", async () => {
  const text = await workflowSource("enrich-catalog");
  const document = parse(text) as {
    jobs: Record<string, { steps: Array<{ run?: string }> }>;
    concurrency: { group: string };
  };
  const commands = Object.values(document.jobs).flatMap((job) =>
    job.steps.flatMap((step) => (step.run ? [step.run] : [])),
  );
  expect(text).toContain("data/registry/projects/*.json");
  expect(text).toContain("data/reports/enrichment-report.json");
  expect(text).not.toMatch(/git add .*data\/snapshots/);
  expect(text).not.toContain("format('--project-id");
  expect(text).toContain('args+=(--project-id "$PROJECT_ID")');
  expect(commands.join("\n")).toContain("npm run check");
  expect(commands.join("\n").indexOf("npm run catalog:enrich")).toBeLessThan(
    commands.join("\n").indexOf("git add data/registry/projects"),
  );
  expect(document.concurrency.group).toBe("catalog-refresh");
  expect(
    (
      parse(await workflowSource("refresh-catalog")) as {
        concurrency: { group: string };
      }
    ).concurrency.group,
  ).toBe("catalog-refresh");
});

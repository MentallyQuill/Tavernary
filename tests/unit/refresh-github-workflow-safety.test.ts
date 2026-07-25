import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test } from "vitest";

const refreshPath = resolve(".github/workflows/refresh-catalog.yml");

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

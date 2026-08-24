import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, expect, test } from "vitest";

const temporaryDirectories: string[] = [];
const resetScript = resolve(
  process.cwd(),
  "scripts/submissions/reset-project-submission-branch.mjs",
);

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

async function writeVocabulary(repository: string, id: string) {
  const directory = join(repository, "data/vocabularies");
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "frontends.json"),
    `${JSON.stringify({ frontends: [{ id, label: "PocketRisu" }] }, null, 2)}\n`,
  );
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

test("rebuilds a generated project branch from main without rebasing stale vocabulary", async () => {
  const temporary = await mkdtemp(
    join(tmpdir(), "tavernary-project-branch-reset-"),
  );
  temporaryDirectories.push(temporary);
  const remote = join(temporary, "remote.git");
  const seed = join(temporary, "seed");
  const runner = join(temporary, "runner");
  const branch = "automation/project-submission-327";

  git(temporary, "init", "--bare", remote);
  git(temporary, "clone", remote, seed);
  git(seed, "config", "user.name", "Test User");
  git(seed, "config", "user.email", "test@example.com");
  await writeVocabulary(seed, "base-frontend");
  git(seed, "add", "data/vocabularies/frontends.json");
  git(seed, "commit", "-m", "seed catalog");
  git(seed, "branch", "-M", "main");
  git(seed, "push", "-u", "origin", "main");

  git(seed, "checkout", "-b", branch);
  await writeVocabulary(seed, "pocketrisu");
  git(seed, "add", "data/vocabularies/frontends.json");
  git(seed, "commit", "-m", "generate PocketRisu");
  git(seed, "push", "-u", "origin", branch);

  git(seed, "checkout", "main");
  await writeVocabulary(seed, "canonical-pocketrisu");
  git(seed, "add", "data/vocabularies/frontends.json");
  git(seed, "commit", "-m", "publish canonical PocketRisu");
  git(seed, "push", "origin", "main");

  git(temporary, "clone", "--branch", "main", remote, runner);
  const result = spawnSync(
    process.execPath,
    [resetScript, "--branch", branch],
    { cwd: runner, encoding: "utf8" },
  );

  expect(result.status, result.stderr).toBe(0);
  expect(git(runner, "branch", "--show-current")).toBe(branch);
  expect(git(runner, "rev-parse", "HEAD")).toBe(
    git(runner, "rev-parse", "origin/main"),
  );
  expect(
    JSON.parse(
      await readFile(join(runner, "data/vocabularies/frontends.json"), "utf8"),
    ),
  ).toEqual({
    frontends: [{ id: "canonical-pocketrisu", label: "PocketRisu" }],
  });
}, 20_000);

import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, expect, test } from "vitest";

import { applyKitSubmission } from "../../scripts/kits/apply-submission.mjs";
import { applyKitWithdrawal } from "../../scripts/kits/apply-withdrawal.mjs";

const temporaryDirectories: string[] = [];
const issue = {
  number: 241,
  user: { id: 12345678, login: "example-author" },
};
const manifest = {
  operation: "create" as const,
  kit_id: null,
  title: "Long-Form Storyteller",
  description: "A complete storytelling stack.",
  project_ids: ["frontend", "memory", "lore"],
};

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function configureAuthor(cwd: string) {
  git(cwd, "config", "user.name", "Kit workflow test");
  git(cwd, "config", "user.email", "kit-workflow@example.com");
  git(cwd, "config", "core.autocrlf", "false");
}

async function writeKit(cwd: string, kit: { id: string }) {
  const directory = resolve(cwd, "data/registry/kits");
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, `${kit.id}.json`),
    `${JSON.stringify(kit, null, 2)}\n`,
  );
}

async function createRemote(initialKit?: { id: string }) {
  const root = await mkdtemp(join(tmpdir(), "tavernary-kit-recovery-"));
  temporaryDirectories.push(root);
  const remote = resolve(root, "remote.git");
  const seed = resolve(root, "seed");
  await mkdir(seed);
  git(root, "init", "--bare", remote);
  git(seed, "init", "-b", "main");
  configureAuthor(seed);

  if (initialKit) {
    await writeKit(seed, initialKit);
  } else {
    const directory = resolve(seed, "data/registry/kits");
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, ".gitkeep"), "");
  }

  git(seed, "add", "data/registry/kits");
  git(seed, "commit", "-m", "seed");
  git(seed, "remote", "add", "origin", remote);
  git(seed, "push", "-u", "origin", "main");
  git(remote, "symbolic-ref", "HEAD", "refs/heads/main");

  return {
    root,
    remote,
    initialSha: git(seed, "rev-parse", "HEAD"),
  };
}

async function cloneAt(
  root: string,
  remote: string,
  name: string,
  sha: string,
) {
  const checkout = resolve(root, name);
  git(
    root,
    "-c",
    "core.autocrlf=false",
    "clone",
    "--branch",
    "main",
    remote,
    checkout,
  );
  configureAuthor(checkout);
  git(checkout, "checkout", "-B", "main", sha);
  return checkout;
}

function synchronizeCurrentMain(cwd: string) {
  git(cwd, "fetch", "origin", "main");
  git(cwd, "checkout", "-B", "main", "origin/main");
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test("a stale create rerun fast-forwards before applying the issue again", async () => {
  const repository = await createRemote();
  const firstRun = await cloneAt(
    repository.root,
    repository.remote,
    "first-create",
    repository.initialSha,
  );
  const published = applyKitSubmission({
    manifest,
    issue,
    now: "2026-07-24T17:00:00.000Z",
  });
  await writeKit(firstRun, published);
  git(firstRun, "add", "data/registry/kits");
  git(firstRun, "commit", "-m", "publish");
  git(firstRun, "push", "origin", "HEAD:main");
  const publishedSha = git(firstRun, "rev-parse", "HEAD");

  const rerun = await cloneAt(
    repository.root,
    repository.remote,
    "rerun-create",
    repository.initialSha,
  );
  synchronizeCurrentMain(rerun);
  const current = JSON.parse(
    await readFile(
      resolve(rerun, "data/registry/kits/long-form-storyteller-241.json"),
      "utf8",
    ),
  );
  const retried = applyKitSubmission({
    manifest,
    issue,
    existingKit: current,
    now: "2026-07-25T17:00:00.000Z",
  });
  await writeKit(rerun, retried);

  expect(git(rerun, "status", "--porcelain")).toBe("");
  expect(git(rerun, "rev-parse", "HEAD")).toBe(publishedSha);
  expect(retried.published_at).toBe("2026-07-24T17:00:00.000Z");
});

test("an unchanged edit retry leaves the registry and timestamp untouched", async () => {
  const published = applyKitSubmission({
    manifest,
    issue,
    now: "2026-07-24T17:00:00.000Z",
  });
  const repository = await createRemote(published);
  const rerun = await cloneAt(
    repository.root,
    repository.remote,
    "rerun-edit",
    repository.initialSha,
  );
  synchronizeCurrentMain(rerun);
  const current = JSON.parse(
    await readFile(
      resolve(rerun, "data/registry/kits/long-form-storyteller-241.json"),
      "utf8",
    ),
  );
  const retried = applyKitSubmission({
    manifest: {
      operation: "edit",
      kit_id: published.id,
      title: published.title,
      description: published.description,
      project_ids: published.project_ids,
    },
    issue,
    existingKit: current,
    now: "2026-07-25T17:00:00.000Z",
  });
  await writeKit(rerun, retried);

  expect(git(rerun, "status", "--porcelain")).toBe("");
  expect(retried.updated_at).toBe(published.updated_at);
});

test("a stale withdrawal rerun preserves the original tombstone", async () => {
  const published = applyKitSubmission({
    manifest,
    issue,
    now: "2026-07-24T17:00:00.000Z",
  });
  const repository = await createRemote(published);
  const firstRun = await cloneAt(
    repository.root,
    repository.remote,
    "first-withdrawal",
    repository.initialSha,
  );
  const withdrawn = applyKitWithdrawal({
    kit: published,
    actorId: issue.user.id,
    now: "2026-07-24T18:00:00.000Z",
  });
  await writeKit(firstRun, withdrawn);
  git(firstRun, "add", "data/registry/kits");
  git(firstRun, "commit", "-m", "withdraw");
  git(firstRun, "push", "origin", "HEAD:main");
  const withdrawnSha = git(firstRun, "rev-parse", "HEAD");

  const rerun = await cloneAt(
    repository.root,
    repository.remote,
    "rerun-withdrawal",
    repository.initialSha,
  );
  synchronizeCurrentMain(rerun);
  const current = JSON.parse(
    await readFile(
      resolve(rerun, "data/registry/kits/long-form-storyteller-241.json"),
      "utf8",
    ),
  );
  const retried = applyKitWithdrawal({
    kit: current,
    actorId: issue.user.id,
    now: "2026-07-25T18:00:00.000Z",
  });
  await writeKit(rerun, retried);

  expect(git(rerun, "status", "--porcelain")).toBe("");
  expect(git(rerun, "rev-parse", "HEAD")).toBe(withdrawnSha);
  expect(retried.withdrawn_at).toBe("2026-07-24T18:00:00.000Z");
});

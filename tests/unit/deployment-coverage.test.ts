import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { readDeploymentCoverage } from "../../scripts/automation/deployment-coverage.mjs";
import { selectDueOperations } from "../../scripts/automation/operation.mjs";
import {
  AUTOMATION_NOW,
  operationFixture,
} from "../helpers/automation-fixtures";

test("a verified source covers original publication ancestors without covering later or unknown revisions", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-coverage-"));
  const git = (args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  try {
    git(["init", "-b", "main"]);
    git(["config", "user.name", "Fixture"]);
    git(["config", "user.email", "fixture@example.invalid"]);
    const revisions: string[] = [];
    for (let index = 0; index < 3; index++) {
      await writeFile(
        join(root, "publication.json"),
        JSON.stringify({ index }),
      );
      git(["add", "publication.json"]);
      git(["commit", "-m", `Publication ${index}`]);
      revisions.push(git(["rev-parse", "HEAD"]));
    }
    expect(
      readDeploymentCoverage({
        root,
        sourceShas: [revisions[1]],
        candidates: [...revisions, "f".repeat(40)],
      }),
    ).toEqual(revisions.slice(0, 2).sort());
    expect(
      readDeploymentCoverage({ root, sourceShas: [], candidates: revisions }),
    ).toEqual([]);
    expect(() =>
      readDeploymentCoverage({
        root,
        sourceShas: ["f".repeat(40)],
        candidates: revisions,
      }),
    ).toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("twenty older publications waiting on deployment cannot starve the one current deployment operation", () => {
  const waiting = Array.from({ length: 20 }, (_, index) =>
    operationFixture({
      stage: "published",
      identity: {
        kind: "project",
        subject: `issue:${index + 1}`,
        inputDigest: "a".repeat(64),
        policyVersion: "1",
      },
      createdAt: new Date(AUTOMATION_NOW - 1000 - index).toISOString(),
    }),
  );
  const deployment = operationFixture({
    stage: "published",
    identity: {
      kind: "deployment",
      subject: `revision:${"b".repeat(40)}`,
      inputDigest: "a".repeat(64),
      policyVersion: "1",
    },
  });
  expect(
    selectDueOperations([...waiting, deployment], { nowMs: AUTOMATION_NOW }),
  ).toEqual([deployment]);
});

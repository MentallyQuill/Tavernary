import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { readCanonicalPublicationEvidence } from "../../scripts/automation/publication-evidence.mjs";
import { createCanonicalPublicationRecord } from "../../scripts/automation/publication-record.mjs";
import {
  preparedResultFixture,
  preparedResultContextFixture,
  operationFixture,
} from "../helpers/automation-fixtures";
import {
  readCanonicalFiles,
  canonicalFileDigests,
  publicationHistory,
} from "../../scripts/automation/canonical-files.mjs";

test("Kit publication history stays at the Kit mutation when bookkeeping and another Kit advance main", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-kit-history-"));
  const git = (args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  try {
    git(["init", "-q"]);
    git(["config", "user.name", "Test"]);
    git(["config", "user.email", "test@example.org"]);
    git(["config", "core.autocrlf", "false"]);
    await mkdir(join(root, "data/registry/kits"), { recursive: true });
    const first = "data/registry/kits/first-kit.json",
      second = "data/registry/kits/second-kit.json";
    await writeFile(join(root, first), "{}\n");
    git(["add", "data"]);
    git(["commit", "-qm", "publish first Kit"]);
    const firstSha = git(["rev-parse", "HEAD"]);
    await writeFile(join(root, second), "{}\n");
    git(["add", "data"]);
    git(["commit", "-qm", "publish another Kit"]);
    const secondSha = git(["rev-parse", "HEAD"]);
    git(["commit", "--allow-empty", "-qm", "receipt bookkeeping"]);
    expect(
      await publicationHistory({
        root,
        revision: git(["rev-parse", "HEAD"]),
        paths: [first, second],
      }),
    ).toEqual({ [first]: firstSha, [second]: secondSha });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("canonical file hashes and history ignore checkout EOL and recover the actual last publication commit", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-canonical-files-"));
  const git = (args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  try {
    git(["init", "-q"]);
    git(["config", "user.email", "test@example.org"]);
    git(["config", "user.name", "Test"]);
    git(["config", "core.autocrlf", "false"]);
    await mkdir(join(root, "data/snapshots/github"), { recursive: true });
    await mkdir(join(root, "data/maintenance/automation/publications"), {
      recursive: true,
    });
    const path = "data/snapshots/github/github-42.json";
    const publication = `data/maintenance/automation/publications/${"a".repeat(64)}.json`;
    const content = '{\n  "source_id": "github-42"\n}\n';
    await writeFile(join(root, path), content);
    await writeFile(join(root, publication), "{}\n");
    git(["add", "data"]);
    git(["commit", "-qm", "publication"]);
    const published = git(["rev-parse", "HEAD"]);
    git(["commit", "--allow-empty", "-qm", "unrelated"]);
    const revision = git(["rev-parse", "HEAD"]);
    await writeFile(join(root, path), content.replaceAll("\n", "\r\n"));
    expect(
      readCanonicalFiles({ root, revision, paths: [path, "data/absent.json"] })[
        path
      ].toString("utf8"),
    ).toBe(content);
    expect(canonicalFileDigests({ root, revision, paths: [path] })[path]).toBe(
      createHash("sha256").update(content).digest("hex"),
    );
    expect(
      await publicationHistory({ root, revision, paths: [publication] }),
    ).toEqual({ [publication]: published });
    await expect(
      publicationHistory({
        root,
        revision,
        paths: [
          `data/maintenance/automation/publications/${"b".repeat(64)}.json`,
        ],
      }),
    ).rejects.toThrow(/no canonical/);
    expect(() =>
      readCanonicalFiles({ root, revision, paths: ["../secret.json"] }),
    ).toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test.each(["refresh", "enrichment-canary", "enrichment-report"] as const)(
  "original %s co-committed publication proof survives a later data update and rejects detached bookkeeping",
  async (kind) => {
    const root = await mkdtemp(join(tmpdir(), "tavernary-publication-proof-"));
    const git = (args: string[]) =>
      execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    const result = preparedResultFixture();
    let operation = preparedResultContextFixture().operation;
    if (kind !== "refresh") {
      operation = operationFixture({
        identity: { ...operation.identity, kind: "enrichment" },
      });
      result.kind = "enrichment";
      result.operationKey = operation.key;
      result.producer.workflow = ".github/workflows/enrich-catalog.yml";
      result.files[0].path = `data/reports/${kind}.json`;
    }
    const record = createCanonicalPublicationRecord({
      result,
      operation,
    });
    const path = result.files[0].path;
    const publication = `data/maintenance/automation/publications/${record.operation.key}.json`;
    try {
      git(["init", "-q"]);
      git(["config", "user.email", "test@example.org"]);
      git(["config", "user.name", "Test"]);
      git(["config", "core.autocrlf", "false"]);
      await mkdir(join(root, dirname(path)), { recursive: true });
      await mkdir(join(root, "data/maintenance/automation/publications"), {
        recursive: true,
      });
      await writeFile(join(root, path), result.files[0].content);
      await writeFile(
        join(root, publication),
        `${JSON.stringify(record, null, 2)}\n`,
      );
      git(["add", "data"]);
      git(["commit", "-qm", "publish exact data"]);
      const published = git(["rev-parse", "HEAD"]);
      await writeFile(
        join(root, path),
        '{"source_id":"github-42","repository_id":42,"updated":true}\n',
      );
      git(["add", "data"]);
      git(["commit", "-qm", "later authorized update"]);
      const proof = await readCanonicalPublicationEvidence({
        root,
        revision: git(["rev-parse", "HEAD"]),
        records: [record],
      });
      expect(proof.publications).toEqual([{ record, revision: published }]);
      expect(proof.fileDigests[`${published}:${path}`]).toBe(
        result.files[0].sha256,
      );
      record.producer.runId++;
      await writeFile(
        join(root, publication),
        `${JSON.stringify(record, null, 2)}\n`,
      );
      git(["add", "data"]);
      git(["commit", "-qm", "detached record modification"]);
      await expect(
        readCanonicalPublicationEvidence({
          root,
          revision: git(["rev-parse", "HEAD"]),
          records: [record],
        }),
      ).rejects.toThrow(/co-committed/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test.each(["executable", "substituted"])(
  "historical publication proof rejects %s data",
  async (variant) => {
    const root = await mkdtemp(join(tmpdir(), "tavernary-invalid-proof-"));
    const git = (args: string[]) =>
      execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    const result = preparedResultFixture();
    const record = createCanonicalPublicationRecord({
      result,
      operation: preparedResultContextFixture().operation,
    });
    const path = result.files[0].path;
    const publication = `data/maintenance/automation/publications/${record.operation.key}.json`;
    try {
      git(["init", "-q"]);
      git(["config", "user.email", "test@example.org"]);
      git(["config", "user.name", "Test"]);
      git(["config", "core.autocrlf", "false"]);
      await mkdir(join(root, "data/snapshots/github"), { recursive: true });
      await mkdir(join(root, "data/maintenance/automation/publications"), {
        recursive: true,
      });
      if (variant === "substituted")
        record.files[0].gitBlobSha = "f".repeat(40);
      await writeFile(join(root, path), result.files[0].content);
      await writeFile(
        join(root, publication),
        `${JSON.stringify(record, null, 2)}\n`,
      );
      git(["add", "data"]);
      if (variant === "executable") git(["update-index", "--chmod=+x", path]);
      git(["commit", "-qm", "invalid publication"]);
      await expect(
        readCanonicalPublicationEvidence({
          root,
          revision: git(["rev-parse", "HEAD"]),
          records: [record],
        }),
      ).rejects.toThrow(/co-committed/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

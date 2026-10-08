import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import {
  readCanonicalFiles,
  canonicalFileDigests,
  publicationHistory,
} from "../../scripts/automation/canonical-files.mjs";

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

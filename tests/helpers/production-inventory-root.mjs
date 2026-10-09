import { cp, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";

export async function productionInventoryRoot(source = process.cwd()) {
  const prefix = join(tmpdir(), "tavernary-inventory-");
  const root = await mkdtemp(prefix);
  const cleanup = async () => {
    if (!resolve(root).startsWith(resolve(prefix)))
      throw new Error("Inventory fixture cleanup escaped its owned directory.");
    await rm(root, { recursive: true, force: true });
  };
  const git = (args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      timeout: 20_000,
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: "2026-10-06T11:00:00Z",
        GIT_COMMITTER_DATE: "2026-10-06T11:00:00Z",
      },
    }).trim();
  try {
    git([
      "clone",
      "--shared",
      "--no-checkout",
      "--quiet",
      resolve(source),
      root,
    ]);
    git(["config", "core.autocrlf", "false"]);
    git(["checkout", "HEAD", "--", "data", "config"]);
    const sourceGit = (args) =>
      execFileSync("git", args, {
        cwd: source,
        encoding: "utf8",
        windowsHide: true,
        timeout: 20_000,
      })
        .split("\0")
        .filter(Boolean);
    const paths = new Set([
      ...sourceGit([
        "diff",
        "--name-only",
        "--no-renames",
        "-z",
        "HEAD",
        "--",
        "data",
        "config",
      ]),
      ...sourceGit([
        "ls-files",
        "--others",
        "--exclude-standard",
        "-z",
        "--",
        "data",
        "config",
      ]),
    ]);
    for (const path of paths) {
      if (path.startsWith("data/maintenance/automation/")) continue;
      const current = join(source, path),
        owned = join(root, path);
      if (!resolve(owned).startsWith(`${resolve(root)}${sep}`))
        throw new Error("Inventory fixture path escaped its owned directory.");
      const exists = await stat(current).then(
        () => true,
        (error) => {
          if (error.code === "ENOENT") return false;
          throw error;
        },
      );
      await rm(owned, { recursive: true, force: true });
      if (exists) {
        await mkdir(dirname(owned), { recursive: true });
        await cp(current, owned, { recursive: true });
      }
    }
    git([
      "rm",
      "--quiet",
      "-r",
      "--force",
      "--ignore-unmatch",
      "--",
      "data/maintenance/automation",
    ]);
    git(["add", "--all", "--", "data", "config"]);
    git([
      "-c",
      "user.name=Inventory Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "--allow-empty",
      "-qm",
      "Owned canonical inventory fixture",
    ]);
    return { root, revision: git(["rev-parse", "HEAD"]), cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

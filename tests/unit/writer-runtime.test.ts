import { mkdtemp, access, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test, vi } from "vitest";
import {
  synchronizeWriterCheckout,
  downloadPreparedArtifact,
} from "../../scripts/automation/writer-runtime.mjs";
test("writer synchronization fetches trusted main without exposing or persisting its scoped token", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-writer-"));
  const calls: Array<{ args: string[]; askpass?: string }> = [];
  const run = vi.fn(
    async (
      _command: string,
      args: string[],
      options: { env: NodeJS.ProcessEnv },
    ) => {
      calls.push({ args, askpass: options.env.GIT_ASKPASS });
      if (args[0] === "fetch") await access(options.env.GIT_ASKPASS!);
      return "";
    },
  );
  try {
    await synchronizeWriterCheckout({
      root,
      env: {
        GITHUB_REPOSITORY: "Owner/Repo",
        GH_TOKEN: "private-scoped-token",
        RUNNER_TEMP: root,
      },
      run,
    });
    expect(calls.map((call) => call.args)).toContainEqual([
      "fetch",
      "--no-tags",
      "https://github.com/Owner/Repo.git",
      "main",
    ]);
    expect(JSON.stringify(calls)).not.toContain("private-scoped-token");
    await expect(
      access(calls.find((call) => call.askpass)?.askpass!),
    ).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("writer synchronization refuses to replace a checkout with tracked local changes", async () => {
  const run = vi.fn(async () => " M data/registry/projects/example.json\n");
  await expect(
    synchronizeWriterCheckout({
      root: process.cwd(),
      env: { GITHUB_REPOSITORY: "Owner/Repo", GH_TOKEN: "secret" },
      run,
    }),
  ).rejects.toThrow();
  expect(run).toHaveBeenCalledTimes(1);
});
test("artifact download is bounded, binary, and restricted to the known GitHub artifact API", async () => {
  const run = vi.fn(async () => Buffer.from([1, 2, 3]));
  const args = ["api", "repos/Owner/Repo/actions/artifacts/42/zip"];
  expect(await downloadPreparedArtifact(args, { run })).toEqual(
    new Uint8Array([1, 2, 3]),
  );
  expect(run).toHaveBeenCalledWith(
    "gh",
    args,
    expect.objectContaining({
      encoding: "buffer",
      maxBuffer: 33_554_432,
      timeout: 120_000,
    }),
  );
  await expect(
    downloadPreparedArtifact(["api", "https://foreign.invalid/artifact"], {
      run,
    }),
  ).rejects.toThrow();
  expect(run).toHaveBeenCalledTimes(1);
});

import { describe, expect, test, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  cleanupFixture,
  serverResponds,
} from "../../scripts/playwright-runner.mjs";

describe("Playwright runner safeguards", () => {
  test("links scan fixtures to trusted dependencies without copying node_modules", async () => {
    const source = await readFile(
      join(process.cwd(), "scripts/build-tavernkeeper-test-export.mjs"),
      "utf8",
    );

    expect(source).toMatch(
      /mkdtemp\(\s*resolve\(rootDirectory, "\.tmp\/tavernary-tavernkeeper-scan-"\)/u,
    );
    const fixtureEntryBlock = source.match(
      /const fixtureEntries = (\[[\s\S]*?\]);/u,
    )?.[1];
    expect(fixtureEntryBlock).toBeTruthy();
    expect(fixtureEntryBlock).not.toContain('"node_modules"');
    expect(fixtureEntryBlock).toContain('"packages"');
    expect(source).toMatch(
      /symlink\([\s\S]*resolve\(rootDirectory, "node_modules"\)[\s\S]*resolve\(workspaceDirectory, "node_modules"\)/u,
    );
    expect(source).toContain("TAVERNARY_TURBOPACK_ROOT: rootDirectory");
    const config = await readFile(
      join(process.cwd(), "next.config.ts"),
      "utf8",
    );
    expect(config).toContain("process.env.TAVERNARY_TURBOPACK_ROOT");
  });

  test("bounds a listener that accepts without responding", async () => {
    const fetchImpl = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("abort")),
        );
      });

    await expect(
      serverResponds("http://127.0.0.1:3000/", { fetchImpl, timeoutMs: 10 }),
    ).resolves.toBe(false);
  });

  test("keeps a Playwright failure primary when fixture cleanup fails", async () => {
    const logError = vi.fn();
    await expect(
      cleanupFixture(
        { cleanup: async () => Promise.reject(new Error("cleanup failed")) },
        { hasPrimaryFailure: true, logError },
      ),
    ).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledWith(
      "Failed to remove TavernKeeper fixture",
      expect.any(Error),
    );
  });
});

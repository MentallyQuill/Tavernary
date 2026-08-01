import { describe, expect, test, vi } from "vitest";

import {
  cleanupFixture,
  serverResponds,
} from "../../scripts/playwright-runner.mjs";

describe("Playwright runner safeguards", () => {
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

import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  baselineQueueDecision,
  provisionalCount,
  runBaselineQueueCli,
} from "../../scripts/catalog/baseline-queue.mjs";

describe("baselineQueueDecision", () => {
  test.each([
    {
      before: 24,
      remaining: 12,
      expected: {
        status: "continue",
        continueQueue: true,
        completed: 12,
      },
    },
    {
      before: 12,
      remaining: 0,
      expected: {
        status: "complete",
        continueQueue: false,
        completed: 12,
      },
    },
    {
      before: 12,
      remaining: 12,
      expected: {
        status: "stalled",
        continueQueue: false,
        completed: 0,
      },
    },
    {
      before: 12,
      remaining: 13,
      expected: {
        status: "stalled",
        continueQueue: false,
        completed: -1,
      },
    },
  ] as const)(
    "classifies $before -> $remaining as $expected.status",
    ({ before, remaining, expected }) => {
      expect(baselineQueueDecision({ before, remaining })).toEqual({
        before,
        remaining,
        ...expected,
      });
    },
  );
});

describe("provisionalCount", () => {
  test("reads a non-negative safe integer", () => {
    expect(provisionalCount({ counts: { provisional: 34 } })).toBe(34);
  });

  test.each([undefined, null, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects malformed provisional count %s",
    (value) => {
      expect(() =>
        provisionalCount({ counts: { provisional: value } }),
      ).toThrow("counts.provisional must be a non-negative safe integer");
    },
  );
});

describe("runBaselineQueueCli", () => {
  test("captures and reports measurable progress", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tavernary-queue-"));
    const manifest = join(directory, "manifest.json");
    const output = join(directory, "output.txt");
    const summary = join(directory, "summary.md");
    await writeFile(manifest, '{"counts":{"provisional":12}}\n');

    await expect(
      runBaselineQueueCli(["capture", "--manifest", manifest], {
        GITHUB_OUTPUT: output,
      }),
    ).resolves.toBe(0);
    await writeFile(manifest, '{"counts":{"provisional":5}}\n');
    await expect(
      runBaselineQueueCli(
        ["evaluate", "--before", "12", "--manifest", manifest],
        {
          GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: summary,
        },
      ),
    ).resolves.toBe(0);

    expect(await readFile(output, "utf8")).toContain("provisional=12");
    expect(await readFile(output, "utf8")).toContain("continue=true");
    expect(await readFile(output, "utf8")).toContain("remaining=5");
    expect(await readFile(summary, "utf8")).toContain("- Decision: continue");
  });

  test("returns a failure and disables continuation when progress stalls", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tavernary-queue-"));
    const manifest = join(directory, "manifest.json");
    const output = join(directory, "output.txt");
    await writeFile(manifest, '{"counts":{"provisional":12}}\n');

    await expect(
      runBaselineQueueCli(
        ["evaluate", "--before", "12", "--manifest", manifest],
        { GITHUB_OUTPUT: output },
      ),
    ).resolves.toBe(1);
    expect(await readFile(output, "utf8")).toContain("continue=false");
    expect(await readFile(output, "utf8")).toContain("remaining=12");
  });
});

# Refresh Catalog Queue Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make baseline catalog refresh chains visibly intentional, continue only after measurable progress, stop with a clear failure when a batch stalls, and preserve the existing bounded soft-failure recovery.

**Architecture:** Add one pure catalog-operations module that reads and validates provisional counts and classifies a batch as `continue`, `complete`, or `stalled`. The GitHub Actions workflow captures the pre-batch count, evaluates the post-batch count through that module, writes human-readable progress to the job summary, and dispatches another baseline batch only when the helper reports real progress.

**Tech Stack:** Node.js 24 ESM, TypeScript declaration files, Vitest, YAML, GitHub Actions, PowerShell-compatible local verification.

## Global Constraints

- Do not create a separate design specification; the accepted diagnosis and recommendations are the authority for this change.
- Preserve the existing `incremental`, `baseline`, `project`, and `forensic` modes.
- Preserve the baseline batch-size range of 1-24 and the existing third-failure transition from `provisional` to `degraded`.
- Preserve `concurrency.group: catalog-refresh` and `cancel-in-progress: false`.
- Do not add legacy compatibility paths; Tavernary is pre-alpha.
- Do not modify canonical registry records, generated catalog data, or GitHub snapshots as part of this code change.
- A stalled baseline batch must publish no successor workflow run.
- A completed baseline queue must remain a successful workflow.
- Use `npm.cmd` and `npx.cmd` for local PowerShell commands.

---

## File Map

- `scripts/catalog/baseline-queue.mjs`: own provisional-count validation, progress classification, GitHub output/summary writing, and the small `capture`/`evaluate` CLI.
- `scripts/catalog/baseline-queue.d.mts`: publish the helper's exact TypeScript interface to Vitest and other consumers.
- `tests/unit/baseline-queue.test.ts`: prove complete, progressing, stalled, regressing, and malformed-count behavior without invoking GitHub Actions.
- `.github/workflows/refresh-catalog.yml`: add a descriptive run name, capture the pre-refresh count, evaluate progress, and gate self-dispatch on the helper output.
- `tests/unit/refresh-github-workflow-safety.test.ts`: lock down queue-step ordering and prohibit unconditional `remaining > 0` chaining.
- `tests/unit/workflows.test.ts`: verify the parsed workflow retains its permissions, modes, concurrency, and new run-name/progress contracts.

### Task 1: Add the baseline queue decision module

**Files:**
- Create: `scripts/catalog/baseline-queue.mjs`
- Create: `scripts/catalog/baseline-queue.d.mts`
- Create: `tests/unit/baseline-queue.test.ts`

**Interfaces:**
- Produces: `provisionalCount(manifest: unknown): number`.
- Produces: `readProvisionalCount(path: string): Promise<number>`.
- Produces: `baselineQueueDecision({ before, remaining }): BaselineQueueDecision`.
- Produces CLI: `node scripts/catalog/baseline-queue.mjs capture --manifest <path>`.
- Produces CLI: `node scripts/catalog/baseline-queue.mjs evaluate --before <count> --manifest <path>`.
- Writes `provisional=<count>` during `capture`.
- Writes `continue=<true|false>`, `remaining=<count>`, and `completed=<count>` during `evaluate`.

- [ ] **Step 1: Write failing queue-decision tests**

Create `tests/unit/baseline-queue.test.ts`:

```ts
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
    expect(await readFile(summary, "utf8")).toContain(
      "- Decision: continue",
    );
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
```

- [ ] **Step 2: Run the tests to verify RED**

Run:

```powershell
npx.cmd vitest run tests/unit/baseline-queue.test.ts
```

Expected: FAIL because `scripts/catalog/baseline-queue.mjs` does not exist.

- [ ] **Step 3: Implement the pure decision functions**

Create `scripts/catalog/baseline-queue.mjs` with these exports:

```js
import { appendFile, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function provisionalCount(manifest) {
  const value = manifest?.counts?.provisional;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(
      "counts.provisional must be a non-negative safe integer",
    );
  }
  return value;
}

export async function readProvisionalCount(path) {
  return provisionalCount(JSON.parse(await readFile(path, "utf8")));
}

function checkedCount(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
  return value;
}

export function baselineQueueDecision({ before, remaining }) {
  const checkedBefore = checkedCount(before, "before");
  const checkedRemaining = checkedCount(remaining, "remaining");
  const completed = checkedBefore - checkedRemaining;

  if (checkedRemaining === 0) {
    return {
      status: "complete",
      continueQueue: false,
      before: checkedBefore,
      remaining: checkedRemaining,
      completed,
    };
  }
  if (checkedRemaining < checkedBefore) {
    return {
      status: "continue",
      continueQueue: true,
      before: checkedBefore,
      remaining: checkedRemaining,
      completed,
    };
  }
  return {
    status: "stalled",
    continueQueue: false,
    before: checkedBefore,
    remaining: checkedRemaining,
    completed,
  };
}
```

- [ ] **Step 4: Add exact CLI behavior**

Continue `scripts/catalog/baseline-queue.mjs` with:

```js
function option(arguments_, name) {
  const index = arguments_.indexOf(name);
  if (index < 0 || !arguments_[index + 1]) {
    throw new Error(`Missing required option: ${name}`);
  }
  return arguments_[index + 1];
}

async function writeOutput(path, values) {
  if (!path) throw new Error("GITHUB_OUTPUT is required");
  await appendFile(
    path,
    `${Object.entries(values)
      .map(([name, value]) => `${name}=${value}`)
      .join("\n")}\n`,
  );
}

async function writeSummary(path, decision) {
  if (!path) return;
  await appendFile(
    path,
    [
      "### Baseline queue",
      "",
      `- Before: ${decision.before}`,
      `- Completed this batch: ${Math.max(0, decision.completed)}`,
      `- Remaining: ${decision.remaining}`,
      `- Decision: ${decision.status}`,
      "",
    ].join("\n"),
  );
}

export async function runBaselineQueueCli(
  arguments_,
  environment = process.env,
) {
  const command = arguments_[0];
  const manifest = option(arguments_, "--manifest");

  if (command === "capture") {
    const provisional = await readProvisionalCount(manifest);
    console.log(
      `Baseline queue starts with ${provisional} provisional project(s).`,
    );
    await writeOutput(environment.GITHUB_OUTPUT, { provisional });
    return 0;
  }

  if (command !== "evaluate") {
    throw new Error(`Unknown baseline queue command: ${command ?? "<empty>"}`);
  }

  const decision = baselineQueueDecision({
    before: Number(option(arguments_, "--before")),
    remaining: await readProvisionalCount(manifest),
  });
  console.log(
    `Baseline queue progress: ${decision.before} -> ${decision.remaining} provisional project(s).`,
  );
  await writeOutput(environment.GITHUB_OUTPUT, {
    continue: decision.continueQueue,
    remaining: decision.remaining,
    completed: Math.max(0, decision.completed),
  });
  await writeSummary(environment.GITHUB_STEP_SUMMARY, decision);

  if (decision.status === "stalled") {
    console.error(
      `::error title=Baseline queue stalled::Provisional count did not decrease (${decision.before} -> ${decision.remaining}); no successor run was dispatched.`,
    );
    return 1;
  }
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runBaselineQueueCli(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(error.stack ?? error.message);
      process.exitCode = 1;
    });
}
```

- [ ] **Step 5: Add the declaration contract**

Create `scripts/catalog/baseline-queue.d.mts`:

```ts
export type BaselineQueueDecision = {
  status: "continue" | "complete" | "stalled";
  continueQueue: boolean;
  before: number;
  remaining: number;
  completed: number;
};

export declare function provisionalCount(manifest: unknown): number;
export declare function readProvisionalCount(path: string): Promise<number>;
export declare function baselineQueueDecision(input: {
  before: number;
  remaining: number;
}): BaselineQueueDecision;
export declare function runBaselineQueueCli(
  arguments_: string[],
  environment?: NodeJS.ProcessEnv,
): Promise<number>;
```

- [ ] **Step 6: Run focused tests and type checking**

Run:

```powershell
npx.cmd vitest run tests/unit/baseline-queue.test.ts
npm.cmd run typecheck
npm.cmd run format:check
```

Expected: all commands pass.

- [ ] **Step 7: Commit the independently tested helper**

```powershell
git add -- scripts/catalog/baseline-queue.mjs scripts/catalog/baseline-queue.d.mts tests/unit/baseline-queue.test.ts
git commit -m "fix(catalog): detect stalled baseline queues"
```

### Task 2: Gate workflow chaining on measurable progress

**Files:**
- Modify: `.github/workflows/refresh-catalog.yml:1-126`
- Modify: `tests/unit/refresh-github-workflow-safety.test.ts:1-70`
- Modify: `tests/unit/workflows.test.ts:160-205`

**Interfaces:**
- Consumes: Task 1 CLI `capture --manifest <path>`.
- Consumes: Task 1 CLI `evaluate --before <count> --manifest <path>`.
- Produces step output: `steps.baseline-progress.outputs.continue`.
- Produces step output: `steps.baseline-progress.outputs.remaining`.
- Dispatches another `baseline` run only when `continue == 'true'`.

- [ ] **Step 1: Replace the permissive workflow test with failing safety contracts**

Replace `continues baselines only after successful publication` in
`tests/unit/refresh-github-workflow-safety.test.ts` with:

```ts
test("continues baselines only after measurable progress", async () => {
  const source = await readFile(refreshPath, "utf8");
  const capture = source.indexOf("Capture baseline queue state");
  const refresh = source.indexOf("Refresh selected sources");
  const evaluate = source.indexOf("Evaluate baseline queue progress");
  const dispatch = source.indexOf("Dispatch next baseline batch");

  expect(capture).toBeGreaterThan(-1);
  expect(capture).toBeLessThan(refresh);
  expect(refresh).toBeLessThan(evaluate);
  expect(evaluate).toBeLessThan(dispatch);
  expect(source).toContain("baseline-queue.mjs capture");
  expect(source).toContain("baseline-queue.mjs evaluate");
  expect(source).toContain(
    "steps.baseline-progress.outputs.continue == 'true'",
  );
  expect(source).toContain("steps.baseline-progress.outputs.remaining");
  expect(source).not.toContain("if (( remaining > 0 ))");
});

test("names catalog runs by their actual operating mode", async () => {
  const source = await readFile(refreshPath, "utf8");

  expect(source).toContain("run-name:");
  expect(source).toContain("scheduled incremental");
  expect(source).toContain("Baseline queue");
  expect(source).toContain("inputs.batch_size");
});
```

- [ ] **Step 2: Strengthen the parsed workflow contract**

In `refreshes snapshots daily without granting production-record writes` in
`tests/unit/workflows.test.ts`, extend the parsed type and assertions:

```ts
const refresh = (await workflow("refresh-catalog")) as {
  "run-name": string;
  permissions: Record<string, string>;
  concurrency: Record<string, unknown>;
  on: {
    workflow_dispatch: {
      inputs: Record<string, { options?: string[]; default?: unknown }>;
    };
  };
  jobs: Record<
    string,
    {
      steps: Array<{
        id?: string;
        name?: string;
        if?: string;
        run?: string;
      }>;
    }
  >;
};

expect(refresh["run-name"]).toContain("Baseline queue");
const refreshSteps = refresh.jobs.refresh.steps;
expect(refreshSteps.map(({ name }) => name)).toEqual(
  expect.arrayContaining([
    "Capture baseline queue state",
    "Evaluate baseline queue progress",
    "Dispatch next baseline batch",
  ]),
);
expect(
  refreshSteps.find(({ id }) => id === "baseline-progress")?.run,
).toContain("baseline-queue.mjs evaluate");
expect(
  refreshSteps.find(({ name }) => name === "Dispatch next baseline batch")?.if,
).toBe("steps.baseline-progress.outputs.continue == 'true'");
```

- [ ] **Step 3: Run workflow tests to verify RED**

Run:

```powershell
npx.cmd vitest run tests/unit/refresh-github-workflow-safety.test.ts tests/unit/workflows.test.ts
```

Expected: FAIL because the workflow has no run name, capture/evaluate split, or progress-gated dispatch.

- [ ] **Step 4: Add the descriptive workflow run name**

Immediately after `name: Refresh catalog` in
`.github/workflows/refresh-catalog.yml`, add:

```yaml
run-name: >-
  ${{ github.event_name == 'schedule'
    && 'Refresh catalog — scheduled incremental'
    || inputs.mode == 'baseline'
    && format('Baseline queue — up to {0} projects', inputs.batch_size)
    || inputs.project_id
    && format('Refresh catalog — {0}: {1}', inputs.mode, inputs.project_id)
    || format('Refresh catalog — {0}', inputs.mode) }}
```

This makes bot-dispatched baseline successors visibly part of a queue while
keeping scheduled, incremental, project, and forensic runs distinguishable.

- [ ] **Step 5: Capture the pre-refresh provisional count**

Immediately before `Refresh selected sources`, add:

```yaml
      - name: Capture baseline queue state
        id: baseline-start
        if: inputs.mode == 'baseline'
        run: >-
          node scripts/catalog/baseline-queue.mjs capture
          --manifest data/snapshots/github-refresh.json
```

The capture happens after checkout/install and before any snapshot mutation.
It reads the same committed manifest contract used by the existing queue.

- [ ] **Step 6: Replace unconditional continuation with evaluation and dispatch**

Replace the existing `Continue baseline queue` step with:

```yaml
      - name: Evaluate baseline queue progress
        id: baseline-progress
        if: ${{ success() && inputs.mode == 'baseline' }}
        env:
          BEFORE: ${{ steps.baseline-start.outputs.provisional }}
        shell: bash
        run: |
          node scripts/catalog/baseline-queue.mjs evaluate \
            --before "$BEFORE" \
            --manifest data/snapshots/github-refresh.json
      - name: Dispatch next baseline batch
        if: steps.baseline-progress.outputs.continue == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          BATCH_SIZE: ${{ inputs.batch_size || 12 }}
          REMAINING: ${{ steps.baseline-progress.outputs.remaining }}
        shell: bash
        run: |
          gh workflow run refresh-catalog.yml \
            --ref main \
            -f mode=baseline \
            -f batch_size="$BATCH_SIZE"
          echo "Queued the next baseline batch with $REMAINING provisional project(s) remaining."
```

Behavior after this replacement:

- `remaining === 0`: evaluation succeeds, records `complete`, and dispatch is skipped.
- `0 < remaining < before`: evaluation succeeds, records progress, and exactly one successor is dispatched.
- `remaining >= before`: evaluation fails with a GitHub error annotation and dispatch is skipped.

- [ ] **Step 7: Run focused workflow tests to verify GREEN**

Run:

```powershell
npx.cmd vitest run tests/unit/baseline-queue.test.ts tests/unit/refresh-github-workflow-safety.test.ts tests/unit/workflows.test.ts
npm.cmd run typecheck
```

Expected: all tests and type checking pass.

- [ ] **Step 8: Run the full repository gate**

Run:

```powershell
npm.cmd run check
git diff --check
git status --short
```

Expected:

- formatting, lint, palette audit, catalog validation/build, typecheck, unit tests, production build, and export verification pass;
- `git diff --check` exits cleanly;
- status contains only currently uncommitted paths from the file map and no registry, generated catalog, or snapshot changes.

- [ ] **Step 9: Review the final workflow diff**

Inspect:

```powershell
git diff -- .github/workflows/refresh-catalog.yml scripts/catalog/baseline-queue.mjs scripts/catalog/baseline-queue.d.mts tests/unit/baseline-queue.test.ts tests/unit/refresh-github-workflow-safety.test.ts tests/unit/workflows.test.ts
```

Confirm:

- there is no `push` trigger in `refresh-catalog.yml`;
- only baseline mode captures/evaluates queue progress;
- the dispatch step depends solely on `continue == 'true'`;
- no registry, generated catalog, or snapshot file was staged by this change;
- the third-failure degradation logic in `refresh-github.mjs` is untouched.

- [ ] **Step 10: Commit the workflow integration**

```powershell
git add -- .github/workflows/refresh-catalog.yml tests/unit/refresh-github-workflow-safety.test.ts tests/unit/workflows.test.ts docs/superpowers/plans/2026-07-24-refresh-catalog-queue-safety.md
git commit -m "ci(catalog): guard baseline queue progress"
```

## Final Acceptance

Before declaring the implementation complete:

1. Run the focused Vitest command from Task 2 Step 7.
2. Run `npm.cmd run check`.
3. Confirm malformed manifest counts fail before dispatch.
4. Confirm `24 -> 12` dispatches exactly one successor.
5. Confirm `12 -> 0` ends successfully without a successor.
6. Confirm `12 -> 12` and `12 -> 13` fail without a successor.
7. Confirm the job summary displays before, completed, remaining, and decision.
8. Confirm Actions run names distinguish scheduled incremental, baseline queue, project, and forensic runs.
9. Confirm no live workflow is manually dispatched merely to test the plan; live resumption of the 34-project baseline queue remains an explicit operator action after merge.

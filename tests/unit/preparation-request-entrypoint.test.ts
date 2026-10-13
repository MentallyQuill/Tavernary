import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { productionInventoryRoot } from "../helpers/production-inventory-root.mjs";
import { receiptFixture } from "../helpers/automation-fixtures";

let fixture: Awaited<ReturnType<typeof productionInventoryRoot>>;
beforeAll(async () => {
  fixture = await productionInventoryRoot();
  const now = Date.now();
  const receipt = receiptFixture();
  receipt.operation.createdAt = new Date(now - 240_000).toISOString();
  receipt.operation.workerRunId = 702;
  receipt.updatedAt = new Date(now - 180_000).toISOString();
  const repository = "MentallyQuill/Tavernary";
  const run = {
    id: 702,
    run_attempt: 1,
    path: ".github/workflows/automation-worker.yml",
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: "c".repeat(40),
    repository: { id: 42, full_name: repository },
    head_repository: { id: 42, full_name: repository },
    actor: { id: 317929880, type: "Bot" },
    display_title: `Automation ${receipt.operation.key}`,
    status: "completed",
    conclusion: "failure",
    created_at: new Date(now - 120_000).toISOString(),
    updated_at: new Date(now - 60_000).toISOString(),
  };
  const archive = zipSync({
    "automation-diagnostic.json": strToU8(
      JSON.stringify({
        schema_version: 1,
        operation_key: receipt.operation.key,
        failure: {
          kind: "configuration",
          reasonCode: "publisher-authentication-failed",
        },
      }),
    ),
  });
  const artifact = {
    id: 900,
    name: "automation-diagnostic-702",
    expired: false,
    size_in_bytes: archive.byteLength,
    digest: `sha256:${createHash("sha256").update(archive).digest("hex")}`,
    created_at: new Date(now - 90_000).toISOString(),
    workflow_run: {
      id: 702,
      repository_id: 42,
      head_repository_id: 42,
      head_branch: "main",
      head_sha: run.head_sha,
    },
  };
  const receiptDirectory = join(
    fixture.root,
    "data/maintenance/automation/operations",
  );
  await mkdir(receiptDirectory, { recursive: true });
  await Promise.all([
    writeFile(
      join(receiptDirectory, `${receipt.operation.key}.json`),
      JSON.stringify(receipt),
    ),
    writeFile(join(fixture.root, "event.json"), "{}"),
    writeFile(
      join(fixture.root, "diagnostic-fixture.json"),
      JSON.stringify({
        revision: fixture.revision,
        run,
        artifact,
        archive: Buffer.from(archive).toString("base64"),
      }),
    ),
  ]);
}, 30_000);
afterAll(async () => {
  await fixture?.cleanup();
});

test.each([
  "review-catalog-policy.yml",
  "refresh-catalog.yml",
  "import-tavernkeeper-reports.yml",
])(
  "%s production request entrypoint completes while loading a failed worker diagnostic",
  async (workflow) => {
    const downloadPath = join(fixture.root, `${workflow}-download.json`);
    const result = await promisify(execFile)(
      process.execPath,
      [
        "--import",
        pathToFileURL(
          resolve("tests/helpers/preparation-diagnostic-preload.mjs"),
        ).href,
        resolve("scripts/automation/preparation-request.mjs"),
      ],
      {
        cwd: fixture.root,
        env: {
          ...process.env,
          GITHUB_REPOSITORY: "MentallyQuill/Tavernary",
          GITHUB_REF: "refs/heads/main",
          GITHUB_EVENT_NAME: "schedule",
          GITHUB_EVENT_PATH: join(fixture.root, "event.json"),
          GITHUB_WORKFLOW_REF: `MentallyQuill/Tavernary/.github/workflows/${workflow}@refs/heads/main`,
          GITHUB_RUN_ID: "",
          GITHUB_OUTPUT: "",
          TAVERNARY_PUBLISHER_BOT_ID: "317929880",
          TAVERNARY_DIAGNOSTIC_FIXTURE: join(
            fixture.root,
            "diagnostic-fixture.json",
          ),
          TAVERNARY_DIAGNOSTIC_DOWNLOAD: downloadPath,
        },
        encoding: "utf8",
        windowsHide: true,
        timeout: 20_000,
        maxBuffer: 131_072,
      },
    ).then(
      ({ stdout, stderr }) => ({ code: 0, stdout, stderr }),
      (error: { code: number; stdout: string; stderr: string }) => error,
    );
    expect(result.code, result.stderr).toBe(0);
    expect(Array.isArray(JSON.parse(result.stdout))).toBe(true);
    expect(JSON.parse(await readFile(downloadPath, "utf8"))).toEqual({
      command: "gh",
      args: ["api", "repos/MentallyQuill/Tavernary/actions/artifacts/900/zip"],
      options: {
        windowsHide: true,
        encoding: "buffer",
        maxBuffer: 33_554_432,
        timeout: 120_000,
      },
    });
  },
  25_000,
);

import { expect, test } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { automationDataDigests } from "../../scripts/automation/data-digests.mjs";
test("native rollback reads regenerate current canonical digests with all network access unavailable", async () => {
  const exec = promisify(execFile);
  const result = await exec(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'globalThis.fetch=()=>{throw new Error("Network is unavailable")}; const {readRollbackCanonicalData}=await import("./scripts/automation/rollback-canonical.mjs");const data=await readRollbackCanonicalData();console.log(JSON.stringify(data));',
    ],
    {
      cwd: process.cwd(),
      timeout: 30000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    },
  );
  const catalog = JSON.parse(
      await readFile("public/catalog/tavernary-catalog-v8.json", "utf8"),
    ),
    targets = JSON.parse(
      await readFile("public/security/tavernkeeper-targets.json", "utf8"),
    );
  expect(JSON.parse(result.stdout)).toMatchObject(
    automationDataDigests({ catalog, targets }),
  );
  expect(JSON.parse(result.stdout).ownerTombstones).toBeInstanceOf(Array);
});

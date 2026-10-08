import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { buildPreparedCatalogPublication } from "../../scripts/automation/publication-build.mjs";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
import project from "../../data/registry/projects/mentallyquill-recursion.json";
import { metadataMaintenanceFixture } from "../helpers/automation-fixtures";
function fixture() {
  const source = JSON.parse(
    readFileSync(`data/registry/sources/${project.source_id}.json`, "utf8"),
  );
  const snapshot = JSON.parse(
    readFileSync(`data/snapshots/github/${project.source_id}.json`, "utf8"),
  );
  const state: AutomationInventoryState = {
    root: process.cwd(),
    repository: "MentallyQuill/Tavernary",
    publisherActorId: 41_982_982,
    nowMs: Date.parse("2026-10-08T12:00:00Z"),
    local: {
      projects: [project],
      sources: [source],
      snapshots: [snapshot],
      kits: [],
      kitSnapshots: [],
      installEvidence: [],
      advisoryState: [],
      blockedUsers: { schema_version: 1, blocked: [] },
      storedReports: {
        schema_version: 5,
        generated_at: "2026-10-08T12:00:00Z",
        preferred_report_ids: [],
        reports: [],
      },
    },
    receipts: [],
    operations: [],
    remote: { issues: [], pulls: [], runs: [], mainHeadSha: "b".repeat(40) },
  };
  const value = {
    ...project,
    summary: "Factual automatic copy verified against source evidence.",
  };
  const content = `${JSON.stringify(value, null, 2)}\n`;
  const file = {
    path: `data/registry/projects/${project.id}.json`,
    type: "file" as const,
    content,
    sha256: createHash("sha256").update(content).digest("hex"),
    bytes: Buffer.byteLength(content),
    baseDigest: null,
  };
  return { state, file };
}
test("the writer rebuilds both public contracts from validated canonical data without modifying its checkout", async () => {
  const { state, file } = fixture();
  const original = structuredClone(state.local);
  const files = await buildPreparedCatalogPublication({
    action: {
      action: "commit",
      operationKeys: ["a".repeat(64)],
      expectedMainSha: "b".repeat(40),
      files: [file],
    },
    state,
  });
  expect(files.map((file) => file.path)).toEqual([
    file.path,
    "public/catalog/tavernary-catalog.json",
    "public/catalog/tavernary-catalog-v8.json",
  ]);
  const legacy = JSON.parse(files[1].content);
  const current = JSON.parse(files[2].content);
  expect(legacy.schemaVersion).toBe(7);
  expect(current.schemaVersion).toBe(8);
  expect(current.projects[0].summary).toBe(JSON.parse(file.content).summary);
  expect(state.local).toEqual(original);
});
test("aggregate cross-reference validation blocks a file that names a nonexistent source", async () => {
  const { state, file } = fixture();
  file.content = JSON.stringify({ ...project, source_id: "github-99999999" });
  file.bytes = Buffer.byteLength(file.content);
  file.sha256 = createHash("sha256").update(file.content).digest("hex");
  await expect(
    buildPreparedCatalogPublication({
      action: {
        action: "commit",
        operationKeys: ["a".repeat(64)],
        expectedMainSha: "b".repeat(40),
        files: [file],
      },
      state,
    }),
  ).rejects.toThrow();
});

test("an unchanged-source cache publication never manufactures new public assets", async () => {
  const input = await metadataMaintenanceFixture({ unchanged: true });
  const data = await input.run();
  const files = Object.entries(data).map(([path, content]) => ({
    path,
    content,
    type: "file" as const,
    bytes: Buffer.byteLength(content),
    sha256: createHash("sha256").update(content).digest("hex"),
    baseDigest: null,
  }));
  const { state } = fixture();
  const published = await buildPreparedCatalogPublication({
    state,
    action: {
      action: "commit",
      operationKeys: [input.operation.key],
      expectedMainSha: "b".repeat(40),
      files,
    },
  });
  expect(published.map((file) => file.path)).toEqual(
    files.map((file) => file.path),
  );
  expect(published[0]).toEqual(files[0]);
  expect(input.modelCalls()).toBe(0);
});

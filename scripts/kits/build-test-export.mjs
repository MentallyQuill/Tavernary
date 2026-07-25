import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildCatalog } from "../catalog/build.mjs";

const fixtureDirectory = resolve("tests/fixtures/kits");

async function readJson(name) {
  return JSON.parse(
    await readFile(resolve(fixtureDirectory, `${name}.json`), "utf8"),
  );
}

function projectRecord(descriptor, index) {
  const visibility = descriptor.visibility ?? "published";
  return {
    schema_version: 3,
    id: descriptor.id,
    name: descriptor.name,
    kind: descriptor.kind,
    summary: `${descriptor.name} is deterministic Kit fixture project ${index + 1}.`,
    metadata_status: "curated",
    source: {
      type: "github",
      repository: `fixture/${descriptor.id}`,
      repository_id: 10_000 + index,
    },
    frontends: ["sillytavern"],
    primary_function: descriptor.primary_function,
    capabilities: [],
    cataloged_at: "2026-07-01T00:00:00.000Z",
    catalog_cohort: "fixture",
    visibility,
    visibility_reason:
      descriptor.visibility_reason ??
      (visibility === "published" ? null : "flagged"),
    refresh_policy: "paused",
  };
}

function waitForExit(child) {
  return new Promise((resolveExit) => {
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
}

async function buildFixtureExport() {
  const [projectDescriptors, kitRecords, kitSnapshots, blockedUsers] =
    await Promise.all([
      readJson("projects"),
      readJson("records"),
      readJson("support"),
      readJson("blocked-users"),
    ]);
  const records = projectDescriptors.map(projectRecord);
  await buildCatalog({
    write: true,
    now: "2026-07-24T12:00:00.000Z",
    records,
    kitRecords,
    kitSnapshots,
    blockedUsers,
  });
  const next = spawn(
    process.execPath,
    [resolve("node_modules/next/dist/bin/next"), "build"],
    { stdio: "inherit", env: process.env },
  );
  const exitCode = await waitForExit(next);
  if (exitCode !== 0) {
    throw new Error(`Fixture Next build exited with ${exitCode}`);
  }
}

let buildError;
try {
  await buildFixtureExport();
} catch (error) {
  buildError = error;
} finally {
  try {
    await buildCatalog({ write: true });
  } catch (restoreError) {
    throw new AggregateError(
      [buildError, restoreError].filter(Boolean),
      "Kit fixture build or production catalog restoration failed",
    );
  }
}
if (buildError) throw buildError;

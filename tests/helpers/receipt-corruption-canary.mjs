import { createRequire, syncBuiltinESMExports } from "node:module";
import { execFileSync } from "node:child_process";
import { productionInventoryRoot } from "./production-inventory-root.mjs";

// Run in native Node: Vite's builtin wrappers cannot replace native ESM reads.
const fs = createRequire(import.meta.url)("node:fs/promises");
const original = { readFile: fs.readFile, readdir: fs.readdir };
const [mode, content = "", suppliedRoot] = process.argv.slice(2);
const fixture = suppliedRoot
  ? {
      root: suppliedRoot,
      revision: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: suppliedRoot,
        encoding: "utf8",
        windowsHide: true,
      }).trim(),
      cleanup: async () => {},
    }
  : await productionInventoryRoot();
const directory =
  mode === "receipt"
    ? "data/maintenance/automation/operations"
    : mode === "authority"
      ? "data/maintenance/automation/publications"
      : null;
const key = "a".repeat(64);
let intercepted = 0,
  apiReads = 0;
if (directory) {
  fs.readdir = async (path, ...options) =>
    String(path).replaceAll("\\", "/").endsWith(directory)
      ? [`${key}.json`]
      : original.readdir(path, ...options);
  fs.readFile = async (path, ...options) => {
    if (
      String(path).replaceAll("\\", "/").endsWith(`${directory}/${key}.json`)
    ) {
      intercepted++;
      return content;
    }
    return original.readFile(path, ...options);
  };
  syncBuiltinESMExports();
}
try {
  const { loadAutomationInventory } =
    await import("../../scripts/automation/inventory.mjs");
  const { assessInventoryHealth } =
    await import("../../scripts/automation/health.mjs");
  const { revision } = fixture;
  const state = await loadAutomationInventory({
    root: fixture.root,
    repository: "MentallyQuill/Tavernary",
    publisherActorId: 41_982_982,
    nowMs: Date.parse("2026-10-08T12:00:00Z"),
    reportIndex: {
      schema_version: 5,
      generated_at: "2026-10-08T12:00:00Z",
      reports: [],
    },
    gh: async (args) => {
      apiReads++;
      const path = args.find((arg) => arg.startsWith("repos/"));
      if (path.endsWith("/git/ref/heads/main"))
        return JSON.stringify({ object: { sha: revision } });
      if (path.endsWith("/issues") || path.endsWith("/pulls")) return "[[]]";
      if (path.endsWith("/actions/runs"))
        return '[{"total_count":0,"workflow_runs":[]}]';
      throw new Error("Unexpected offline inventory route");
    },
  });
  const findings = assessInventoryHealth(state).filter(
    (finding) => finding.code === "receipt-invalid",
  );
  delete state.local.receiptInspectionComplete;
  process.stdout.write(
    JSON.stringify({
      status: "accepted",
      intercepted,
      apiReads,
      receipts: state.receipts.length,
      invalidReceiptKeys: state.local.invalidReceiptKeys,
      findings,
      findingsWithoutCompleteInspection: assessInventoryHealth(state).filter(
        (finding) => finding.code === "receipt-invalid",
      ),
    }),
  );
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      status: "rejected",
      intercepted,
      apiReads,
      error: error instanceof SyntaxError ? "invalid-json" : error.message,
    }),
  );
} finally {
  Object.assign(fs, original);
  syncBuiltinESMExports();
  await fixture.cleanup();
}

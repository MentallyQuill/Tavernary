import { spawn } from "node:child_process";
import { resolve } from "node:path";

import { buildTavernKeeperTestExport } from "./build-tavernkeeper-test-export.mjs";
import { configuredBasePath } from "./verify-static-export.mjs";

const port = process.env.PORT ?? "3000";
const serverUrl = `http://127.0.0.1:${port}`;
const healthUrl = `${serverUrl}${configuredBasePath()}/`;
const playwrightCli = resolve("node_modules/@playwright/test/cli.js");
const playwrightArguments = process.argv.slice(2);
const scanFixtureIndex = playwrightArguments.indexOf("--scan-fixture");
const useScanFixture = scanFixtureIndex !== -1;
if (useScanFixture) playwrightArguments.splice(scanFixtureIndex, 1);

async function serverIsListening() {
  try {
    await fetch(healthUrl);
    return true;
  } catch {
    return false;
  }
}

async function assertPortIsFree() {
  if (await serverIsListening()) {
    throw new Error(`${healthUrl} is already in use`);
  }
}

async function waitForServer(server) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Static export server exited with ${server.exitCode}`);
    }
    if (await serverIsListening()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error("Timed out waiting for the static export server");
}

function waitForExit(child) {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolveExit) => {
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
}

await assertPortIsFree();

let exitCode = 1;
let server = null;
let playwright = null;
let fixture = null;
let runError = null;
let receivedSignal = null;
const fixtureAbortController = new AbortController();
const onSignal = (signal) => {
  receivedSignal ??= signal;
  fixtureAbortController.abort();
  playwright?.kill("SIGTERM");
  server?.kill("SIGTERM");
};
process.once("SIGINT", () => onSignal("SIGINT"));
process.once("SIGTERM", () => onSignal("SIGTERM"));

try {
  if (useScanFixture) {
    fixture = await buildTavernKeeperTestExport({
      signal: fixtureAbortController.signal,
    });
    if (receivedSignal) {
      throw new Error(`TavernKeeper browser run received ${receivedSignal}`);
    }
    // The build can take long enough for another process to claim the port.
    await assertPortIsFree();
  }
  if (receivedSignal) {
    throw new Error(`TavernKeeper browser run received ${receivedSignal}`);
  }
  server = spawn(process.execPath, ["scripts/serve-static-export.mjs"], {
    env: {
      ...process.env,
      ...(fixture
        ? { TAVERNARY_STATIC_EXPORT_DIR: fixture.outputDirectory }
        : {}),
    },
    stdio: ["ignore", "inherit", "inherit"],
  });
  await waitForServer(server);
  if (fixture) {
    const fixtureHtml = await (await fetch(healthUrl)).text();
    if (
      !fixtureHtml.includes("tavernkeeper-scan-indicator-green") ||
      !fixtureHtml.includes("tavernkeeper-scan-indicator-yellow")
    ) {
      throw new Error("TavernKeeper browser fixture was not exported");
    }
  }
  playwright = spawn(
    process.execPath,
    [playwrightCli, "test", ...playwrightArguments],
    {
      env: {
        ...process.env,
        ...(fixture ? { TAVERNARY_SCAN_FIXTURE: "true" } : {}),
      },
      stdio: "inherit",
    },
  );
  exitCode = await waitForExit(playwright);
} catch (error) {
  runError = error;
  throw error;
} finally {
  if (server?.exitCode === null) server.kill("SIGTERM");
  if (server) await waitForExit(server);
  if (fixture) {
    try {
      await fixture.cleanup();
    } catch (cleanupError) {
      if (runError)
        console.error("Failed to remove TavernKeeper fixture", cleanupError);
      else throw cleanupError;
    }
  }
  if (receivedSignal) exitCode = 130;
}

process.exitCode = exitCode;

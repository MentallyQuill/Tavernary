import { spawn } from "node:child_process";
import { resolve } from "node:path";

import { configuredBasePath } from "./verify-static-export.mjs";
import {
  buildTavernKeeperTestExport,
  restoreProductionExport,
} from "./build-tavernkeeper-test-export.mjs";

const port = process.env.PORT ?? "3000";
const serverUrl = `http://127.0.0.1:${port}`;
const healthUrl = `${serverUrl}${configuredBasePath()}/`;
const playwrightCli = resolve("node_modules/@playwright/test/cli.js");

async function serverIsListening() {
  try {
    const response = await fetch(healthUrl);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(server) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Static export server exited with ${server.exitCode}`);
    }
    if (await serverIsListening()) {
      return;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error("Timed out waiting for the static export server");
}

function waitForExit(child) {
  if (child.exitCode !== null) {
    return Promise.resolve(child.exitCode);
  }
  return new Promise((resolveExit) => {
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
}

if (await serverIsListening()) {
  throw new Error(`${healthUrl} is already in use`);
}

let exitCode = 1;
let server = null;
let runError = null;
try {
  await buildTavernKeeperTestExport();
  server = spawn(process.execPath, ["scripts/serve-static-export.mjs"], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  await waitForServer(server);
  const fixtureHtml = await (await fetch(healthUrl)).text();
  if (
    !fixtureHtml.includes("tavernkeeper-scan-indicator-green") ||
    !fixtureHtml.includes("tavernkeeper-scan-indicator-yellow")
  ) {
    throw new Error("TavernKeeper browser fixture was not exported");
  }
  const playwright = spawn(
    process.execPath,
    [playwrightCli, "test", ...process.argv.slice(2)],
    { stdio: "inherit" },
  );
  exitCode = await waitForExit(playwright);
} catch (error) {
  runError = error;
  throw error;
} finally {
  if (server?.exitCode === null) {
    server.kill("SIGTERM");
  }
  if (server) await waitForExit(server);
  try {
    await restoreProductionExport();
  } catch (restoreError) {
    if (runError)
      console.error("Failed to restore the production export", restoreError);
    else throw restoreError;
  }
}

process.exitCode = exitCode;

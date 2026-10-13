import { createRequire, syncBuiltinESMExports } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { promisify } from "node:util";

// Keep inventory reconstruction and CLI top-level await native. Replace only
// external IO so the default diagnostic downloader must finish without network.
const fixture = JSON.parse(
  readFileSync(process.env.TAVERNARY_DIAGNOSTIC_FIXTURE, "utf8"),
);
const childProcess = createRequire(import.meta.url)("node:child_process");
const nativeSpawn = childProcess.spawn;
const nativeExecFile = childProcess.execFile;
function githubResponse(args) {
  const path = args.find((arg) => arg.startsWith("repos/"));
  if (args[0] !== "api") throw new Error("Unexpected offline GitHub command.");
  if (path?.endsWith("/git/ref/heads/main"))
    return JSON.stringify({ object: { sha: fixture.revision } });
  if (path?.endsWith("/actions/runs/702/artifacts"))
    return JSON.stringify([{ total_count: 1, artifacts: [fixture.artifact] }]);
  if (path?.endsWith("/actions/runs/702")) return JSON.stringify(fixture.run);
  if (path?.endsWith("/actions/runs")) {
    const runs = args.some((arg) => arg.startsWith("status="))
      ? []
      : [fixture.run];
    return JSON.stringify([{ total_count: runs.length, workflow_runs: runs }]);
  }
  if (path?.endsWith("/issues/42"))
    return JSON.stringify({
      number: 42,
      state: "closed",
      labels: [],
      updated_at: fixture.run.updated_at,
    });
  if (path?.endsWith("/issues") || path?.endsWith("/pulls")) return "[[]]";
  throw new Error(`Unexpected offline GitHub route: ${path}`);
}
childProcess.spawn = (command, args, options) => {
  if (!["gh", "gh.exe"].includes(command))
    return nativeSpawn(command, args, options);
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  queueMicrotask(() => {
    try {
      child.stdout.end(githubResponse(args));
      child.stderr.end();
      child.emit("close", 0);
    } catch (error) {
      child.emit("error", error);
    }
  });
  return child;
};
childProcess.execFile = (command, args, options, callback) => {
  if (!["gh", "gh.exe"].includes(command))
    return nativeExecFile(command, args, options, callback);
  if (
    args.length !== 2 ||
    args[0] !== "api" ||
    args[1] !== "repos/MentallyQuill/Tavernary/actions/artifacts/900/zip"
  )
    throw new Error("Unexpected offline artifact download.");
  writeFileSync(
    process.env.TAVERNARY_DIAGNOSTIC_DOWNLOAD,
    JSON.stringify({ command, args, options }),
  );
  queueMicrotask(() =>
    callback(null, Buffer.from(fixture.archive, "base64"), ""),
  );
};
childProcess.execFile[promisify.custom] = (command, args, options) =>
  new Promise((resolve, reject) => {
    childProcess.execFile(command, args, options, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout, stderr });
    });
  });
syncBuiltinESMExports();
globalThis.fetch = async () => {
  throw new Error("Network is disabled in the diagnostic CLI regression.");
};

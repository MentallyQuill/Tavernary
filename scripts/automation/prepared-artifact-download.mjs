import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
async function command(executable, args, options) {
  return (await exec(executable, args, { windowsHide: true, ...options }))
    .stdout;
}

export async function downloadPreparedArtifact(args, { run = command } = {}) {
  if (
    args.length !== 2 ||
    args[0] !== "api" ||
    !/^repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/artifacts\/[1-9]\d*\/zip$/u.test(
      args[1],
    )
  )
    throw new Error("Prepared artifact API is invalid.");
  const archive = await run("gh", args, {
    encoding: "buffer",
    maxBuffer: 33_554_432,
    timeout: 120_000,
  });
  if (
    !(Buffer.isBuffer(archive) || archive instanceof Uint8Array) ||
    archive.byteLength > 33_554_432
  )
    throw new Error("Prepared artifact download exceeds its limit.");
  return new Uint8Array(archive);
}

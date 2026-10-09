import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  planRuntimeTransition,
  validateSupportedRuntimes,
} from "./runtime-policy.mjs";

const supported = validateSupportedRuntimes(
  JSON.parse(await readFile("config/supported-runtimes.json", "utf8")),
);
const versionFile = await readFile(".node-version", "utf8");
if (versionFile !== `${supported.productionMajor}\n`)
  throw new Error("Runtime declarations disagree.");
const { stdout } = await promisify(execFile)(
  "gh",
  [
    "api",
    "repos/nodejs/Release/contents/schedule.json",
    "-H",
    "Accept: application/vnd.github.raw+json",
  ],
  {
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 1_048_576,
    windowsHide: true,
  },
);
const decision = planRuntimeTransition({
  supported,
  officialSchedule: JSON.parse(stdout),
  candidateResults: [],
  nowMs: Date.now(),
});
if (process.argv[2] === "matrix") {
  process.stdout.write(
    JSON.stringify([
      supported.productionMajor,
      ...(decision.candidateMajor ? [decision.candidateMajor] : []),
    ]),
  );
} else if (process.argv[2] === "candidate") {
  const major = Number(process.env.TAVERNARY_RUNTIME_CANDIDATE);
  if (![supported.productionMajor, decision.candidateMajor].includes(major))
    throw new Error("Runtime candidate has no official stable LTS support.");
  if (major !== supported.productionMajor) {
    const { readRuntimeFiles, buildRuntimeProposal } =
      await import("./runtime-maintenance.mjs");
    const root = process.cwd();
    const files = await buildRuntimeProposal({
      root,
      before: await readRuntimeFiles(root),
      candidateMajor: major,
    });
    for (const [path, text] of Object.entries(files))
      await writeFile(resolve(root, path), text);
  }
} else throw new Error("Runtime check mode is invalid.");

import { appendFile, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function provisionalCount(manifest) {
  const value = manifest?.counts?.provisional;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("counts.provisional must be a non-negative safe integer");
  }
  return value;
}

export async function readProvisionalCount(path) {
  return provisionalCount(JSON.parse(await readFile(path, "utf8")));
}

function checkedCount(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
  return value;
}

export function baselineQueueDecision({ before, remaining }) {
  const checkedBefore = checkedCount(before, "before");
  const checkedRemaining = checkedCount(remaining, "remaining");
  const completed = checkedBefore - checkedRemaining;

  if (checkedRemaining === 0) {
    return {
      status: "complete",
      continueQueue: false,
      before: checkedBefore,
      remaining: checkedRemaining,
      completed,
    };
  }
  if (checkedRemaining < checkedBefore) {
    return {
      status: "continue",
      continueQueue: true,
      before: checkedBefore,
      remaining: checkedRemaining,
      completed,
    };
  }
  return {
    status: "stalled",
    continueQueue: false,
    before: checkedBefore,
    remaining: checkedRemaining,
    completed,
  };
}

function option(arguments_, name) {
  const index = arguments_.indexOf(name);
  if (index < 0 || !arguments_[index + 1]) {
    throw new Error(`Missing required option: ${name}`);
  }
  return arguments_[index + 1];
}

async function writeOutput(path, values) {
  if (!path) throw new Error("GITHUB_OUTPUT is required");
  await appendFile(
    path,
    `${Object.entries(values)
      .map(([name, value]) => `${name}=${value}`)
      .join("\n")}\n`,
  );
}

async function writeSummary(path, decision) {
  if (!path) return;
  await appendFile(
    path,
    [
      "### Baseline queue",
      "",
      `- Before: ${decision.before}`,
      `- Completed this batch: ${Math.max(0, decision.completed)}`,
      `- Remaining: ${decision.remaining}`,
      `- Decision: ${decision.status}`,
      "",
    ].join("\n"),
  );
}

export async function runBaselineQueueCli(
  arguments_,
  environment = process.env,
) {
  const command = arguments_[0];
  const manifest = option(arguments_, "--manifest");

  if (command === "capture") {
    const provisional = await readProvisionalCount(manifest);
    console.log(
      `Baseline queue starts with ${provisional} provisional project(s).`,
    );
    await writeOutput(environment.GITHUB_OUTPUT, { provisional });
    return 0;
  }

  if (command !== "evaluate") {
    throw new Error(`Unknown baseline queue command: ${command ?? "<empty>"}`);
  }

  const decision = baselineQueueDecision({
    before: Number(option(arguments_, "--before")),
    remaining: await readProvisionalCount(manifest),
  });
  console.log(
    `Baseline queue progress: ${decision.before} -> ${decision.remaining} provisional project(s).`,
  );
  await writeOutput(environment.GITHUB_OUTPUT, {
    continue: decision.continueQueue,
    remaining: decision.remaining,
    completed: Math.max(0, decision.completed),
  });
  await writeSummary(environment.GITHUB_STEP_SUMMARY, decision);

  if (decision.status === "stalled") {
    console.error(
      `::error title=Baseline queue stalled::Provisional count did not decrease (${decision.before} -> ${decision.remaining}); no successor run was dispatched.`,
    );
    return 1;
  }
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runBaselineQueueCli(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(error.stack ?? error.message);
      process.exitCode = 1;
    });
}

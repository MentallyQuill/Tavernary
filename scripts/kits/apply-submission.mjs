import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import trustedEditorRegistry from "../../data/maintenance/trusted-tavernary-editors.json" with { type: "json" };
import {
  assertKitSubmissionEligible,
  parseKitIssueFields,
} from "../submissions/triage-kit-issue.mjs";
import { validateKitSubmission } from "../submissions/validate-kit-submission.mjs";

function slug(value) {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-|-$/gu, "") || "kit"
  );
}

export function findExistingKitForSubmission({ manifest, issueNumber, kits }) {
  return manifest.operation === "edit"
    ? kits.find((kit) => kit.id === manifest.kit_id)
    : kits.find((kit) => kit.source_issue_number === issueNumber);
}

export function applyKitSubmission({
  manifest,
  issue,
  existingKit,
  editAuthority = "author",
  now,
}) {
  if (manifest.operation === "create") {
    if (existingKit) {
      if (existingKit.status === "withdrawn") {
        throw new Error(
          "A withdrawn Kit cannot be republished as a create retry.",
        );
      }
      const isIdenticalRetry =
        existingKit.source_issue_number === issue.number &&
        existingKit.author.github_user_id === issue.user.id &&
        existingKit.title === manifest.title.trim() &&
        existingKit.description === manifest.description.trim() &&
        JSON.stringify(existingKit.project_ids) ===
          JSON.stringify(manifest.project_ids);
      if (isIdenticalRetry) {
        return existingKit;
      }
      throw new Error("An exact duplicate Kit already exists.");
    }
    return {
      schema_version: 1,
      id: `${slug(manifest.title)}-${issue.number}`,
      status: "published",
      title: manifest.title.trim(),
      description: manifest.description.trim(),
      author: {
        github_user_id: issue.user.id,
        login: issue.user.login,
      },
      source_issue_number: issue.number,
      project_ids: [...manifest.project_ids],
      published_at: now,
      updated_at: now,
    };
  }

  if (!existingKit || existingKit.id !== manifest.kit_id) {
    throw new Error("The Kit selected for editing does not exist.");
  }
  if (existingKit.status === "withdrawn") {
    throw new Error("A withdrawn Kit cannot be edited.");
  }
  if (
    editAuthority !== "tavernary-staff" &&
    existingKit.author.github_user_id !== issue.user.id
  ) {
    throw new Error("Only the Kit author may publish an edit.");
  }
  const title = manifest.title.trim();
  const description = manifest.description.trim();
  const author =
    editAuthority === "tavernary-staff"
      ? structuredClone(existingKit.author)
      : { ...existingKit.author, login: issue.user.login };
  const unchanged =
    existingKit.title === title &&
    existingKit.description === description &&
    JSON.stringify(existingKit.author) === JSON.stringify(author) &&
    JSON.stringify(existingKit.project_ids) ===
      JSON.stringify(manifest.project_ids);
  if (unchanged) {
    return existingKit;
  }
  return {
    ...existingKit,
    title,
    description,
    author,
    project_ids: [...manifest.project_ids],
    updated_at: now,
  };
}

export async function writeAppliedKitOutput(path, kit) {
  if (!path) throw new Error("GITHUB_OUTPUT is required");
  await appendFile(path, `kit_id=${kit.id}\n`, "utf8");
}

export async function runDirectKitPublication({
  env = process.env,
  load,
  gh,
  commit,
  build,
} = {}) {
  const { executeGh } =
    await import("../submissions/kit-submission-reconciliation.mjs");
  const { assertTrustedAutomationContext } =
    await import("../automation/github-inventory.mjs");
  const { loadAutomationInventory } =
    await import("../automation/inventory.mjs");
  const { synchronizeWriterCheckout } =
    await import("../automation/writer-runtime.mjs");
  const { acquirePreparedKitData } =
    await import("../automation/kit-preparation.mjs");
  const { createPreparedKitRecord } =
    await import("../automation/kit-publication-context.mjs");
  const { buildPreparedCatalogPublication } =
    await import("../automation/publication-build.mjs");
  const { commitCanonicalData } =
    await import("../automation/canonical-data.mjs");
  const { createHash } = await import("node:crypto");
  const repository = env.GITHUB_REPOSITORY;
  assertTrustedAutomationContext(env, repository);
  const withdrawal =
    env.GITHUB_WORKFLOW_REF ===
    `${repository}/.github/workflows/apply-kit-withdrawal.yml@refs/heads/main`;
  if (
    (!withdrawal &&
      env.GITHUB_WORKFLOW_REF !==
        `${repository}/.github/workflows/apply-kit-submission.yml@refs/heads/main`) ||
    env.GITHUB_EVENT_NAME !== "workflow_dispatch"
  )
    throw new Error("Direct Kit publication context is invalid.");
  const issueNumber = Number(env.ISSUE_NUMBER);
  if (!Number.isSafeInteger(issueNumber) || issueNumber < 1)
    throw new Error("Kit issue identity is invalid.");
  gh ??= executeGh;
  load ??= async () => {
    await synchronizeWriterCheckout({ root: process.cwd(), env });
    return loadAutomationInventory({
      root: process.cwd(),
      gh,
      repository,
      publisherActorId: Number(env.TAVERNARY_PUBLISHER_BOT_ID),
      nowMs: Date.now(),
      submissionIssueNumber: issueNumber,
      executingWriterRunId: Number(env.GITHUB_RUN_ID),
    });
  };
  const select = (state) =>
    state.operations.find(
      (operation) =>
        operation.identity.subject === `issue:${issueNumber}` &&
        operation.identity.kind === (withdrawal ? "withdrawal" : "kit"),
    );
  const initial = await load();
  const operation = select(initial);
  if (!operation) return { status: "superseded" };
  if (
    [
      "published",
      "deployment-requested",
      "deployment-confirmed",
      "finalized",
    ].includes(operation.stage)
  )
    return { status: "already-published", sha: operation.expectedSha };
  if (
    operation.stage !== "validated" ||
    operation.workerRunId !== null ||
    operation.retry?.failure.kind === "permanent" ||
    (operation.nextEligibleAt &&
      Date.parse(operation.nextEligibleAt) > initial.nowMs)
  )
    return { status: "waiting" };
  const expected = createPreparedKitRecord({ state: initial, operation });
  const outputs = await acquirePreparedKitData({
    state: initial,
    operation,
    gh,
  });
  const kitPaths = [
    `data/registry/kits/${expected.id}.json`,
    `data/snapshots/github/kits/${expected.id}.json`,
  ];
  if (Object.keys(outputs).some((path) => !kitPaths.includes(path)))
    throw new Error("Direct Kit output path is invalid.");
  const files = Object.entries(outputs).map(([path, content]) => ({
    path,
    content,
    type: "file",
    bytes: Buffer.byteLength(content),
    sha256: createHash("sha256").update(content).digest("hex"),
    baseDigest: null,
  }));
  const publication = await (build ?? buildPreparedCatalogPublication)({
    state: initial,
    action: {
      action: "commit",
      files,
      expectedMainSha: initial.local.revision,
      operationKeys: [operation.key],
    },
  });
  const allowed = [
    ...kitPaths,
    "public/catalog/tavernary-catalog.json",
    "public/catalog/tavernary-catalog-v8.json",
  ];
  if (
    publication.some((file) => !allowed.includes(file.path)) ||
    !publication.some((file) => file.path === kitPaths[0])
  )
    throw new Error("Direct Kit publication path is invalid.");
  const fresh = await load();
  const current = select(fresh);
  if (
    fresh.local.revision !== initial.local.revision ||
    fresh.remote.mainHeadSha !== fresh.local.revision ||
    current?.key !== operation.key ||
    current.stage !== "validated" ||
    current.workerRunId !== null ||
    current.retry?.failure.kind === "permanent" ||
    (current.nextEligibleAt &&
      Date.parse(current.nextEligibleAt) > fresh.nowMs) ||
    JSON.stringify(
      createPreparedKitRecord({
        state: fresh,
        operation: current,
        now: new Date(initial.nowMs).toISOString(),
      }),
    ) !== JSON.stringify(expected)
  )
    return { status: "waiting", reason: "input-superseded" };
  try {
    const result = await (
      commit ?? ((input) => commitCanonicalData({ ...input, gh }))
    )({
      repository,
      expectedMainSha: initial.local.revision,
      files: publication,
      message: `feat(kits): apply issue #${issueNumber}`,
    });
    return {
      status: "published",
      sha: result.sha,
      operationKey: operation.key,
    };
  } catch (error) {
    if (error.code === "input-superseded")
      return { status: "waiting", reason: error.code };
    throw error;
  }
}

async function readJsonDirectory(path) {
  const files = (await readdir(path))
    .filter((file) => file.endsWith(".json"))
    .sort();
  return Promise.all(
    files.map(async (file) =>
      JSON.parse(await readFile(resolve(path, file), "utf8")),
    ),
  );
}

async function atomicWrite(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

async function fetchIssue(repository, issueNumber, token) {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/issues/${issueNumber}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "Tavernary-kit-publication",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!response.ok) {
    throw new Error(`Unable to fetch issue ${issueNumber}: ${response.status}`);
  }
  return response.json();
}

async function main() {
  const issue = await fetchIssue(
    process.env.GITHUB_REPOSITORY,
    process.env.ISSUE_NUMBER,
    process.env.GITHUB_TOKEN,
  );
  assertKitSubmissionEligible(issue);
  const [projects, kits, blockedUsers] = await Promise.all([
    readJsonDirectory(resolve("data/registry/projects")),
    readJsonDirectory(resolve("data/registry/kits")),
    readFile("data/moderation/blocked-github-users.json", "utf8").then(
      JSON.parse,
    ),
  ]);
  const validation = validateKitSubmission({
    ...parseKitIssueFields(issue.body ?? ""),
    actor: {
      id: issue.user.id,
      login: issue.user.login,
      association: issue.author_association,
    },
    projects,
    kits,
    blockedUsers,
    trustedEditors: trustedEditorRegistry,
    sourceIssueNumber: issue.number,
  });
  if (!validation.valid) {
    throw new Error(
      `Kit submission is invalid: ${validation.errors.join(" ")}`,
    );
  }
  const existingKit = findExistingKitForSubmission({
    manifest: validation.manifest,
    issueNumber: issue.number,
    kits,
  });
  const record = applyKitSubmission({
    manifest: validation.manifest,
    issue,
    existingKit,
    editAuthority: validation.editAuthority,
    now: new Date().toISOString(),
  });
  await atomicWrite(resolve("data/registry/kits", `${record.id}.json`), record);
  await writeAppliedKitOutput(process.env.GITHUB_OUTPUT, record);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}

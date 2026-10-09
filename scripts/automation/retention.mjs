import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateAutomationReceipt } from "./receipts.mjs";
import { validateAutomationOperation } from "./operation.mjs";
import {
  canonicalGitBlobSha,
  validateCanonicalPublicationRecord,
} from "./publication-record.mjs";
import { isConfirmedDeployment } from "./deployment-operations.mjs";
import { assertCanonicalWriterContext } from "./github-inventory.mjs";
import { commitCanonicalData } from "./canonical-data.mjs";
import { listGithubSiteReleases } from "./site-bundle-github.mjs";
const sha = /^[a-f0-9]{40}$/u,
  key = /^[a-f0-9]{64}$/u;
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const markerPath = (operationKey) =>
  `data/maintenance/automation/terminal/${operationKey.slice(0, 2)}/${operationKey}.json`;
function invalid() {
  throw new Error("Automation retirement proof is invalid.");
}
function prepared(path, value) {
  const content = json(value);
  return {
    path,
    type: "file",
    content,
    bytes: Buffer.byteLength(content),
    sha256: createHash("sha256").update(content).digest("hex"),
    baseDigest: null,
  };
}
export function planAutomationRetention({
  state,
  protectedSourceShas = [],
  pruneDeployments = false,
}) {
  const nowMs = state.nowMs;
  if (
    !Number.isSafeInteger(nowMs) ||
    nowMs < 0 ||
    protectedSourceShas.some((value) => !sha.test(value))
  )
    invalid();
  const cutoff = nowMs - 90 * 86400000;
  const files = [],
    removeFiles = [];
  const receipts = (state.receipts ?? []).map(validateAutomationReceipt);
  const publications = new Map(
    (state.local.publications ?? []).map(({ record, revision }) => [
      validateCanonicalPublicationRecord(record).operation.key,
      { record, revision },
    ]),
  );
  const pending = new Set(
    (state.operations ?? [])
      .filter((operation) => operation.stage !== "finalized")
      .map((operation) => operation.key),
  );
  const ordered = [...receipts].sort(
    (a, b) =>
      Date.parse(a.completedAt ?? a.updatedAt) -
        Date.parse(b.completedAt ?? b.updatedAt) ||
      a.operation.key.localeCompare(b.operation.key),
  );
  for (const receipt of ordered) {
    const operation = receipt.operation,
      publication = publications.get(operation.key);
    if (
      operation.stage !== "finalized" ||
      Date.parse(receipt.completedAt) > cutoff ||
      pending.has(operation.key) ||
      operation.identity.kind === "enrichment" ||
      !publication ||
      publication.revision !== operation.expectedSha ||
      !(state.local.confirmedRevisions ?? []).includes(publication.revision) ||
      publication.record.files.some(
        (file) =>
          state.local.publicationFileDigests?.[
            `${publication.revision}:${file.path}`
          ] !== file.sha256,
      )
    )
      continue;
    if (!sha.test(state.local.revision)) invalid();
    const receiptBlobSha = canonicalGitBlobSha(json(receipt));
    const publicationBlobSha = canonicalGitBlobSha(json(publication.record));
    files.push(
      prepared(markerPath(operation.key), {
        schema_version: 1,
        operationKey: operation.key,
        expectedSha: operation.expectedSha,
        completedAt: receipt.completedAt,
        retiredFromSha: state.local.revision,
        receiptBlobSha,
        publicationBlobSha,
      }),
    );
    removeFiles.push(
      {
        path: `data/maintenance/automation/operations/${operation.key}.json`,
        gitBlobSha: receiptBlobSha,
      },
      {
        path: `data/maintenance/automation/publications/${operation.key}.json`,
        gitBlobSha: publicationBlobSha,
      },
    );
    if (files.length === 64) break;
  }
  if (pruneDeployments) {
    const protectedShas = new Set([
      ...protectedSourceShas,
      state.local.activeDeployment?.deployment?.sourceSha,
      ...(state.operations ?? [])
        .filter((operation) => operation.stage !== "finalized")
        .map((operation) => operation.expectedSha),
      ...receipts
        .filter(
          (receipt) =>
            receipt.operation.stage !== "finalized" ||
            receipt.operation.identity.kind === "enrichment",
        )
        .map((receipt) => receipt.operation.expectedSha),
      ...[...publications.values()].map((publication) => publication.revision),
    ]);
    const deployments = (state.local.deployments ?? [])
      .filter(
        (record) =>
          record.schema_version === 1 &&
          sha.test(record.sourceSha ?? "") &&
          Number.isSafeInteger(record.workflowRunId) &&
          record.workflowRunId > 0 &&
          /^run-[1-9]\d*-attempt-[1-9]\d*$/u.test(record.buildId ?? "") &&
          record.buildId.startsWith(`run-${record.workflowRunId}-attempt-`) &&
          Number.isFinite(Date.parse(record.confirmedAt)) &&
          Date.parse(record.confirmedAt) <= nowMs &&
          isConfirmedDeployment(record, {
            sha: record.sourceSha,
            catalogDigest: record.confirmation?.catalogDigest,
            targetDigest: record.confirmation?.targetDigest,
          }),
      )
      .sort(
        (a, b) =>
          Date.parse(b.confirmedAt) - Date.parse(a.confirmedAt) ||
          a.sourceSha.localeCompare(b.sourceSha),
      );
    for (const record of deployments.slice(0, 3))
      protectedShas.add(record.sourceSha);
    for (const record of deployments) {
      if (
        protectedShas.has(record.sourceSha) ||
        Date.parse(record.confirmedAt) > cutoff ||
        files.length + removeFiles.length >= 256
      )
        continue;
      removeFiles.push({
        path: `data/maintenance/automation/deployments/${record.sourceSha}.json`,
        gitBlobSha: canonicalGitBlobSha(json(record)),
      });
    }
  }
  return { files, removeFiles };
}
function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 65536,
    stdio: ["ignore", "pipe", "pipe"],
  }).trimEnd();
}
export async function runAutomationStateRetention({
  env,
  gh,
  load,
  availableSlots,
  commit = (input) => commitCanonicalData({ ...input, gh }),
}) {
  assertCanonicalWriterContext(env, env.GITHUB_REPOSITORY);
  if (
    !Number.isSafeInteger(availableSlots) ||
    availableSlots < 0 ||
    availableSlots > 20
  )
    invalid();
  if (!availableSlots) return { status: "waiting", reason: "operation-limit" };
  const state = await load();
  if (
    state.repository !== env.GITHUB_REPOSITORY ||
    state.local.revision !== state.remote.mainHeadSha
  )
    invalid();
  const pruneDeployments =
    env.TAVERNARY_IMMUTABLE_RELEASES_ENABLED === "true" &&
    (state.local.deployments ?? []).some(
      (record) => Date.parse(record.confirmedAt) <= state.nowMs - 90 * 86400000,
    );
  const protectedSourceShas = pruneDeployments
    ? (
        await listGithubSiteReleases(gh, `repos/${state.repository}/releases`)
      ).flatMap((release) => {
        const source =
          /^site-bundle-([a-f0-9]{40})-run-[1-9]\d*-attempt-[1-9]\d*$/u.exec(
            release.tag_name ?? "",
          )?.[1];
        return source ? [source] : [];
      })
    : [];
  const plan = planAutomationRetention({
    state,
    protectedSourceShas,
    pruneDeployments,
  });
  if (!plan.files.length && !plan.removeFiles.length) return { status: "idle" };
  const result = await commit({
    repository: state.repository,
    expectedMainSha: state.local.revision,
    ...plan,
    message: "chore(automation): retire confirmed terminal state",
  });
  return {
    status: "retired",
    sha: result.sha,
    removed: plan.removeFiles.length,
  };
}
export async function loadRetiredAutomationReceipts({
  root,
  revision,
  operations,
  nowMs,
}) {
  if (
    !sha.test(revision) ||
    !Number.isSafeInteger(nowMs) ||
    !Array.isArray(operations) ||
    operations.length > 100_000
  )
    invalid();
  const receipts = [];
  for (const operation of operations) {
    validateAutomationOperation(operation);
    const path = markerPath(operation.key);
    let content;
    try {
      const stat = await lstat(resolve(root, path));
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096)
        invalid();
      content = await readFile(resolve(root, path), "utf8");
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    const marker = JSON.parse(content);
    if (
      Buffer.byteLength(content) > 4096 ||
      Object.keys(marker).sort().join(",") !==
        "completedAt,expectedSha,operationKey,publicationBlobSha,receiptBlobSha,retiredFromSha,schema_version" ||
      marker.schema_version !== 1 ||
      marker.operationKey !== operation.key ||
      !key.test(marker.operationKey) ||
      [
        marker.expectedSha,
        marker.retiredFromSha,
        marker.receiptBlobSha,
        marker.publicationBlobSha,
      ].some((value) => !sha.test(value)) ||
      !Number.isFinite(Date.parse(marker.completedAt)) ||
      Date.parse(marker.completedAt) > nowMs - 90 * 86400000 ||
      git(root, ["show", `${revision}:${path}`]) !== content.trimEnd()
    )
      invalid();
    git(root, ["merge-base", "--is-ancestor", marker.retiredFromSha, revision]);
    git(root, [
      "merge-base",
      "--is-ancestor",
      marker.expectedSha,
      marker.retiredFromSha,
    ]);
    if (
      git(root, [
        "rev-parse",
        `${marker.retiredFromSha}:data/maintenance/automation/operations/${operation.key}.json`,
      ]) !== marker.receiptBlobSha ||
      git(root, [
        "rev-parse",
        `${marker.retiredFromSha}:data/maintenance/automation/publications/${operation.key}.json`,
      ]) !== marker.publicationBlobSha
    )
      invalid();
    const receipt = validateAutomationReceipt(
      JSON.parse(git(root, ["cat-file", "blob", marker.receiptBlobSha])),
    );
    const publication = validateCanonicalPublicationRecord(
      JSON.parse(git(root, ["cat-file", "blob", marker.publicationBlobSha])),
    );
    if (
      receipt.operation.key !== operation.key ||
      publication.operation.key !== operation.key ||
      receipt.operation.stage !== "finalized" ||
      receipt.operation.expectedSha !== marker.expectedSha ||
      receipt.completedAt !== marker.completedAt
    )
      invalid();
    receipts.push(receipt);
  }
  return receipts;
}

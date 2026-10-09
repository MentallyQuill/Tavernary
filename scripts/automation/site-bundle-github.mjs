import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertCanonicalWriterContext,
  githubFailureStatus,
} from "./github-inventory.mjs";
import { executeGh } from "../submissions/kit-submission-reconciliation.mjs";
import { loadGithubSiteBundle } from "./deployment-github.mjs";
import { isConfirmedDeployment } from "./deployment-operations.mjs";
import { decodeSiteBundle, SITE_BUNDLE_LIMITS } from "./site-bundle.mjs";
import { planSiteBundleRetention } from "./site-bundle-retention.mjs";
import { fingerprintProjectPublicationInput } from "../publication/project-publication-transaction.mjs";
const exec = promisify(execFile),
  repositoryName = "MentallyQuill/Tavernary",
  sha = /^[a-f0-9]{40}$/u,
  digest = /^sha256:[a-f0-9]{64}$/u;
const hash = (bytes) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
function fail(code = "validation-failed") {
  throw Object.assign(
    new Error(
      "Retained site bundle provenance, integrity or configuration is invalid.",
    ),
    { code },
  );
}
function parse(value, maxBytes = 4 * 1024 * 1024) {
  if (typeof value !== "string" || Buffer.byteLength(value) > maxBytes) fail();
  return JSON.parse(value);
}
export async function listGithubSiteReleases(gh, route) {
  if (route !== `repos/${repositoryName}/releases`) fail();
  const found = [];
  for (let page = 1; page <= 10; page++) {
    const rows = parse(await gh(["api", `${route}?per_page=100&page=${page}`]));
    if (!Array.isArray(rows) || rows.length > 100) fail();
    found.push(...rows);
    if (rows.length < 100) return found;
  }
  fail("provider-configuration-invalid");
}
const same = (a, b) =>
  fingerprintProjectPublicationInput(a) ===
  fingerprintProjectPublicationInput(b);
function stableRelease(release) {
  return {
    id: release.id,
    tag_name: release.tag_name,
    target_commitish: release.target_commitish,
    draft: release.draft,
    immutable: release.immutable,
    authorId: release.author?.id,
    assets: release.assets
      .map((asset) => ({
        id: asset.id,
        name: asset.name,
        state: asset.state,
        size: asset.size,
        digest: asset.digest,
        uploaderId: asset.uploader?.id,
      }))
      .sort((a, b) => a.id - b.id),
  };
}
function validDeployment(record, nowMs) {
  return (
    record?.schema_version === 1 &&
    sha.test(record.sourceSha ?? "") &&
    /^run-[1-9]\d*-attempt-[1-9]\d*$/u.test(record.buildId ?? "") &&
    Number.isSafeInteger(record.workflowRunId) &&
    record.workflowRunId > 0 &&
    record.buildId.startsWith(`run-${record.workflowRunId}-attempt-`) &&
    Number.isFinite(Date.parse(record.confirmedAt)) &&
    new Date(record.confirmedAt).toISOString() === record.confirmedAt &&
    Date.parse(record.confirmedAt) <= nowMs + 300000 &&
    isConfirmedDeployment(record, {
      sha: record.sourceSha,
      catalogDigest: record.confirmation?.catalogDigest,
      targetDigest: record.confirmation?.targetDigest,
    })
  );
}
export async function downloadSiteGithubBytes(args, { run = exec } = {}) {
  const route = `repos/${repositoryName}/`;
  if (
    !Array.isArray(args) ||
    args[0] !== "api" ||
    !args[1]?.startsWith(route) ||
    !(
      (args.length === 2 &&
        /^actions\/artifacts\/[1-9]\d*\/zip$/u.test(
          args[1].slice(route.length),
        )) ||
      (args.length === 4 &&
        /^releases\/assets\/[1-9]\d*$/u.test(args[1].slice(route.length)) &&
        args[2] === "-H" &&
        args[3] === "Accept: application/octet-stream")
    )
  )
    fail();
  const result = await run("gh", args, {
    encoding: "buffer",
    maxBuffer: SITE_BUNDLE_LIMITS.archiveBytes,
    timeout: 120000,
    windowsHide: true,
  });
  const bytes = result.stdout ?? result;
  if (
    !(Buffer.isBuffer(bytes) || ArrayBuffer.isView(bytes)) ||
    bytes.byteLength > SITE_BUNDLE_LIMITS.archiveBytes
  )
    fail();
  return new Uint8Array(bytes);
}
function tagFor(record) {
  return `site-bundle-${record.sourceSha}-${record.buildId}`;
}
function checkRelease(release, publisherActorId) {
  if (
    !Number.isSafeInteger(release?.id) ||
    release.id < 1 ||
    release.author?.id !== publisherActorId ||
    !/^site-bundle-[a-f0-9]{40}-run-[1-9]\d*-attempt-[1-9]\d*$/u.test(
      release.tag_name ?? "",
    ) ||
    !Array.isArray(release.assets) ||
    release.assets.length > 2 ||
    typeof release.draft !== "boolean" ||
    (!release.draft && release.immutable !== true)
  )
    fail("provider-configuration-invalid");
  const names = new Set();
  for (const asset of release.assets) {
    if (
      !["site-bundle.tsb.gz", "bundle-proof.json"].includes(asset.name) ||
      names.has(asset.name) ||
      !Number.isSafeInteger(asset.id) ||
      asset.id < 1 ||
      asset.state !== "uploaded" ||
      !digest.test(asset.digest ?? "") ||
      !Number.isSafeInteger(asset.size) ||
      asset.size < 1 ||
      asset.size >
        (asset.name === "bundle-proof.json"
          ? 65536
          : SITE_BUNDLE_LIMITS.archiveBytes) ||
      asset.uploader?.id !== publisherActorId
    )
      fail();
    names.add(asset.name);
  }
  return release;
}
async function checkTag({ release, gh, repository, sourceSha }) {
  try {
    const ref = parse(
      await gh(["api", `repos/${repository}/git/ref/tags/${release.tag_name}`]),
    );
    if (ref.object?.type !== "commit" || ref.object.sha !== sourceSha) fail();
  } catch (error) {
    if (release.draft && githubFailureStatus(error) === 404) return;
    throw error;
  }
}
async function readReleaseProof({
  release,
  gh,
  download,
  repository,
  publisherActorId,
  nowMs,
  isAncestor,
  revision,
}) {
  checkRelease(release, publisherActorId);
  if (release.draft) fail();
  const asset = release.assets.find(
      (asset) => asset.name === "bundle-proof.json",
    ),
    bundle = release.assets.find(
      (asset) => asset.name === "site-bundle.tsb.gz",
    );
  if (!asset || !bundle) fail();
  const contents = await download([
    "api",
    `repos/${repository}/releases/assets/${asset.id}`,
    "-H",
    "Accept: application/octet-stream",
  ]);
  if (contents.byteLength !== asset.size || hash(contents) !== asset.digest)
    fail();
  const proof = parse(
    new TextDecoder("utf-8", { fatal: true }).decode(contents),
    65536,
  );
  if (
    !proof ||
    Object.keys(proof).length !== 3 ||
    proof.schemaVersion !== 1 ||
    !validDeployment(proof.deployment, nowMs) ||
    proof.archiveDigest !== bundle.digest ||
    release.tag_name !== tagFor(proof.deployment) ||
    (proof.deployment.sourceSha !== revision &&
      isAncestor(proof.deployment.sourceSha, revision) !== true)
  )
    fail();
  await checkTag({
    release,
    gh,
    repository,
    sourceSha: proof.deployment.sourceSha,
  });
  return { proof, bundle };
}
export async function retainGithubSiteBundle({
  runId,
  env = process.env,
  load,
  gh = executeGh,
  download = downloadSiteGithubBytes,
  isAncestor,
  loadBundle = (input) => loadGithubSiteBundle({ ...input, gh, download }),
}) {
  const repository = env.GITHUB_REPOSITORY;
  assertCanonicalWriterContext(env, repository);
  if (
    repository !== repositoryName ||
    env.TAVERNARY_IMMUTABLE_RELEASES_ENABLED !== "true"
  )
    fail("provider-configuration-invalid");
  const publisherActorId = Number(env.TAVERNARY_PUBLISHER_BOT_ID),
    state = await load();
  if (
    !Number.isSafeInteger(state.nowMs) ||
    !sha.test(state.revision ?? "") ||
    !Array.isArray(state.deployments)
  )
    fail();
  const record = state.deployments.find(
    (record) => record.workflowRunId === runId,
  );
  if (
    !validDeployment(record, state.nowMs) ||
    (record.sourceSha !== state.revision &&
      isAncestor(record.sourceSha, state.revision) !== true)
  )
    fail();
  if (
    state.deployments.some(
      (other) =>
        validDeployment(other, state.nowMs) &&
        other.sourceSha !== record.sourceSha &&
        isAncestor(record.sourceSha, other.sourceSha) === true,
    )
  )
    return { status: "superseded" };
  const tag = tagFor(record),
    route = `repos/${repository}/releases`;
  let release;
  try {
    release = parse(await gh(["api", `${route}/tags/${tag}`]));
    checkRelease(release, publisherActorId);
  } catch (error) {
    if (githubFailureStatus(error) !== 404) throw error;
  }
  let status = "already-retained";
  if (!release || release.draft) {
    if (release && release.target_commitish !== record.sourceSha) fail();
    const saved = release?.assets.find(
      (asset) => asset.name === "site-bundle.tsb.gz",
    );
    let loaded;
    if (saved) {
      const archive = await download([
        "api",
        `repos/${repository}/releases/assets/${saved.id}`,
        "-H",
        "Accept: application/octet-stream",
      ]);
      if (archive.byteLength !== saved.size || hash(archive) !== saved.digest)
        fail();
      loaded = {
        runId,
        archive,
        bundle: decodeSiteBundle({ archive, archiveDigest: saved.digest }),
      };
    } else
      loaded = await loadBundle({
        repository,
        publisherActorId,
        runId,
        currentMainSha: state.revision,
        isAncestor,
        expectedSourceSha: record.sourceSha,
      });
    const verified = decodeSiteBundle({
        archive: loaded.archive,
        archiveDigest: loaded.bundle.archiveDigest,
      }),
      manifest = verified.manifest;
    if (
      loaded.runId !== runId ||
      manifest.sourceSha !== record.sourceSha ||
      manifest.buildId !== record.buildId ||
      manifest.buildDigest !== record.bundleDigest ||
      manifest.catalogDigest !== record.confirmation.catalogDigest ||
      manifest.targetDigest !== record.confirmation.targetDigest
    )
      fail();
    const proof = {
        schemaVersion: 1,
        deployment: record,
        archiveDigest: verified.archiveDigest,
      },
      proofBytes = Buffer.from(`${JSON.stringify(proof, null, 2)}\n`);
    if (!release) {
      release = parse(
        await gh(
          ["api", "--method", "POST", route, "--input", "-"],
          JSON.stringify({
            tag_name: tag,
            target_commitish: record.sourceSha,
            name: `Verified site bundle ${record.sourceSha.slice(0, 12)}`,
            body: "Retained verified Tavernary export. Restore requires current canonical data and owner-removal checks.",
            draft: true,
            prerelease: true,
            make_latest: "false",
          }),
        ),
      );
      checkRelease(release, publisherActorId);
    }
    if (release.target_commitish !== record.sourceSha) fail();
    await checkTag({ release, gh, repository, sourceSha: record.sourceSha });
    const values = [
        { name: "site-bundle.tsb.gz", bytes: loaded.archive },
        { name: "bundle-proof.json", bytes: proofBytes },
      ],
      pending = [];
    for (const value of values) {
      const previous = release.assets.find(
        (asset) => asset.name === value.name,
      );
      if (
        previous &&
        (previous.digest !== hash(value.bytes) ||
          previous.size !== value.bytes.byteLength)
      )
        fail();
      if (!previous) pending.push(value);
    }
    if (pending.length) {
      const directory = await mkdtemp(
        join(tmpdir(), "tavernary-release-bundle-"),
      );
      try {
        const paths = [];
        for (const value of pending) {
          const path = join(directory, value.name);
          await writeFile(path, value.bytes, { flag: "wx" });
          paths.push(path);
        }
        await gh(["release", "upload", tag, ...paths, "--repo", repository]);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
    release = parse(await gh(["api", `${route}/${release.id}`]));
    checkRelease(release, publisherActorId);
    if (
      release.assets.length !== 2 ||
      values.some((value) => {
        const asset = release.assets.find((asset) => asset.name === value.name);
        return (
          !asset ||
          asset.digest !== hash(value.bytes) ||
          asset.size !== value.bytes.byteLength
        );
      })
    )
      fail();
    const fresh = await load();
    if (
      !sha.test(fresh.revision ?? "") ||
      (record.sourceSha !== fresh.revision &&
        isAncestor(record.sourceSha, fresh.revision) !== true) ||
      !fresh.deployments.some((value) => same(value, record))
    )
      fail("input-superseded");
    await checkTag({ release, gh, repository, sourceSha: record.sourceSha });
    release = parse(
      await gh(
        ["api", "--method", "PATCH", `${route}/${release.id}`, "--input", "-"],
        JSON.stringify({ draft: false, make_latest: "false" }),
      ),
    );
    status = "retained";
  }
  const current = await readReleaseProof({
    release,
    gh,
    download,
    repository,
    publisherActorId,
    nowMs: state.nowMs,
    isAncestor,
    revision: state.revision,
  });
  if (!same(current.proof.deployment, record)) fail();
  const releases = (await listGithubSiteReleases(gh, route)).filter(
      (value) =>
        value.author?.id === publisherActorId &&
        /^site-bundle-[a-f0-9]{40}-run-[1-9]\d*-attempt-[1-9]\d*$/u.test(
          value.tag_name ?? "",
        ) &&
        value.draft === false,
    ),
    bundles = [];
  for (const value of releases) {
    const data =
      value.id === release.id
        ? current
        : await readReleaseProof({
            release: value,
            gh,
            download,
            repository,
            publisherActorId,
            nowMs: state.nowMs,
            isAncestor,
            revision: state.revision,
          });
    const deployment = data.proof.deployment;
    bundles.push({
      id: value.id,
      runId: deployment.workflowRunId,
      sourceSha: deployment.sourceSha,
      buildId: deployment.buildId,
      confirmedAt: deployment.confirmedAt,
      archiveDigest: data.proof.archiveDigest,
    });
  }
  if (!bundles.some((bundle) => bundle.id === release.id)) fail();
  const retention = planSiteBundleRetention({
    bundles,
    nowMs: state.nowMs,
    protectedBundleIds: [
      ...new Set([release.id, ...(state.protectedBundleIds ?? [])]),
    ],
  });
  for (const id of retention.removeIds) {
    const guard = await load();
    if (guard.protectedBundleIds?.includes(id)) fail("input-superseded");
    const candidate = releases.find((value) => value.id === id),
      fresh = parse(await gh(["api", `${route}/${id}`]));
    checkRelease(fresh, publisherActorId);
    if (!same(stableRelease(candidate), stableRelease(fresh)))
      fail("input-superseded");
    await gh(["api", "--method", "DELETE", `${route}/${id}`]);
  }
  return {
    status,
    releaseId: release.id,
    sourceSha: record.sourceSha,
    archiveDigest: current.proof.archiveDigest,
    retention,
  };
}
export async function inspectRetainedGithubSiteBundle({
  repository,
  publisherActorId,
  releaseId,
  currentMainSha,
  nowMs,
  gh = executeGh,
  download = downloadSiteGithubBytes,
  isAncestor,
}) {
  if (
    repository !== repositoryName ||
    !Number.isSafeInteger(publisherActorId) ||
    publisherActorId < 1 ||
    !Number.isSafeInteger(releaseId) ||
    releaseId < 1 ||
    !sha.test(currentMainSha ?? "") ||
    !Number.isSafeInteger(nowMs) ||
    nowMs < 0
  )
    fail();
  const release = parse(
    await gh(["api", `repos/${repository}/releases/${releaseId}`]),
  );
  if (release.id !== releaseId) fail();
  const data = await readReleaseProof({
    release,
    gh,
    download,
    repository,
    publisherActorId,
    nowMs,
    isAncestor,
    revision: currentMainSha,
  });
  return {
    releaseId,
    deployment: data.proof.deployment,
    archiveDigest: data.proof.archiveDigest,
    asset: data.bundle,
  };
}
export async function loadRetainedGithubSiteBundle(input) {
  const {
    repository,
    gh = executeGh,
    download = downloadSiteGithubBytes,
  } = input;
  const inspection = await inspectRetainedGithubSiteBundle(input);
  const data = {
    bundle: inspection.asset,
    proof: {
      deployment: inspection.deployment,
      archiveDigest: inspection.archiveDigest,
    },
  };
  const archive = await download([
    "api",
    `repos/${repository}/releases/assets/${data.bundle.id}`,
    "-H",
    "Accept: application/octet-stream",
  ]);
  if (
    archive.byteLength !== data.bundle.size ||
    hash(archive) !== data.bundle.digest
  )
    fail();
  const bundle = decodeSiteBundle({
      archive,
      archiveDigest: data.proof.archiveDigest,
    }),
    record = data.proof.deployment,
    manifest = bundle.manifest;
  if (
    manifest.sourceSha !== record.sourceSha ||
    manifest.buildId !== record.buildId ||
    manifest.buildDigest !== record.bundleDigest ||
    manifest.catalogDigest !== record.confirmation.catalogDigest ||
    manifest.targetDigest !== record.confirmation.targetDigest
  )
    fail();
  return { releaseId: inspection.releaseId, bundle, deployment: record };
}

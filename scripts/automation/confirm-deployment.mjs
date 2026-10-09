import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { automationDataDigests } from "./data-digests.mjs";
import { deploymentSiteOrigin } from "./deployment-origin.mjs";
export { deploymentSiteOrigin } from "./deployment-origin.mjs";
import {
  validateRevisionManifest,
  validSiteAssetPath,
  REVISION_LIMITS,
} from "./revision-manifest.mjs";

function integrity() {
  throw Object.assign(
    new Error("Public artifact integrity differs from the expected export."),
    { code: "public-integrity-failed" },
  );
}
function isBytes(value) {
  return (
    ArrayBuffer.isView(value) &&
    Object.prototype.toString.call(value) === "[object Uint8Array]"
  );
}
function verifiedJson(bytes, asset) {
  if (
    !isBytes(bytes) ||
    !asset ||
    bytes.length !== asset.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== asset.sha256
  )
    integrity();
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    integrity();
  }
}
export async function confirmDeployment({
  expected,
  fetchManifest,
  fetchCatalog,
  fetchTargets,
  fetchAsset,
  browserSmoke,
  nowMs,
}) {
  let verified;
  try {
    verified = validateRevisionManifest(expected);
    if (!Number.isSafeInteger(nowMs) || nowMs < 0)
      throw new Error("Invalid confirmation time");
  } catch {
    return { status: "incident", reason: "invalid-expected-manifest" };
  }
  let publicManifest;
  try {
    publicManifest = await fetchManifest();
  } catch {
    return { status: "waiting", reason: "public-unavailable" };
  }
  try {
    publicManifest = validateRevisionManifest(publicManifest);
  } catch {
    return { status: "incident", reason: "invalid-public-manifest" };
  }
  if (publicManifest.sourceSha !== verified.sourceSha)
    return { status: "waiting", reason: "different-revision" };
  if (
    publicManifest.buildDigest !== verified.buildDigest ||
    publicManifest.buildId !== verified.buildId ||
    publicManifest.catalogDigest !== verified.catalogDigest ||
    publicManifest.targetDigest !== verified.targetDigest
  )
    return { status: "waiting", reason: "different-build" };
  try {
    const asset = (path) => verified.assets.find((file) => file.path === path);
    const [catalogBytes, targetBytes] = await Promise.all([
      fetchCatalog(),
      fetchTargets(),
    ]);
    const catalog = verifiedJson(
      catalogBytes,
      asset("catalog/tavernary-catalog-v8.json"),
    );
    const targets = verifiedJson(
      targetBytes,
      asset("security/tavernkeeper-targets.json"),
    );
    if (
      catalog?.schemaVersion !== 8 ||
      !Array.isArray(catalog.projects) ||
      !Array.isArray(catalog.kits) ||
      targets?.schema_version !== 3 ||
      !Array.isArray(targets.repositories)
    )
      integrity();
    const actual = automationDataDigests({ catalog, targets });
    if (
      actual.catalogDigest !== verified.catalogDigest ||
      actual.targetDigest !== verified.targetDigest
    )
      integrity();
    const legacy = verifiedJson(
      await fetchAsset("catalog/tavernary-catalog.json"),
      asset("catalog/tavernary-catalog.json"),
    );
    if (legacy?.schemaVersion !== 7 || !Array.isArray(legacy.projects))
      integrity();
    for (const path of ["index.html", "menu/index.html"]) {
      const bytes = await fetchAsset(path),
        entry = asset(path);
      if (
        !isBytes(bytes) ||
        bytes.length !== entry.bytes ||
        createHash("sha256").update(bytes).digest("hex") !== entry.sha256
      )
        integrity();
    }
    if ((await browserSmoke({ expected: verified, catalog })) !== true)
      return { status: "incident", reason: "essential-browser-failed" };
    // Re-read after browser navigation so a deployment changing underneath the probe is never confirmed.
    const finalManifest = validateRevisionManifest(await fetchManifest());
    if (
      finalManifest.sourceSha !== verified.sourceSha ||
      finalManifest.buildDigest !== verified.buildDigest ||
      finalManifest.buildId !== verified.buildId
    )
      return { status: "waiting", reason: "different-build" };
    return {
      status: "confirmed",
      deployment: {
        schema_version: 1,
        sourceSha: verified.sourceSha,
        status: "confirmed",
        buildId: verified.buildId,
        bundleDigest: verified.buildDigest,
        confirmedAt: new Date(nowMs).toISOString(),
        confirmation: {
          sourceSha: verified.sourceSha,
          catalogDigest: verified.catalogDigest,
          targetDigest: verified.targetDigest,
          buildDigest: verified.buildDigest,
          essentialSmokePassed: true,
        },
      },
    };
  } catch (error) {
    return error?.code === "public-integrity-failed" ||
      error instanceof SyntaxError
      ? { status: "incident", reason: "public-integrity-failed" }
      : { status: "waiting", reason: "public-unavailable" };
  }
}
export async function pollDeploymentConfirmation({
  attempt,
  sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
  maxAttempts = 8,
  signal,
}) {
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 12)
    throw new Error("Confirmation attempts exceed their bound.");
  let result;
  for (let index = 0; index < maxAttempts; index++) {
    if (signal?.aborted)
      return { status: "waiting", reason: "public-unavailable" };
    result = await attempt();
    if (result.status !== "waiting" || index === maxAttempts - 1) return result;
    const wait = sleep(Math.min(15000, 5000 * (index + 1)));
    if (signal) await beforeAbort(wait, signal);
    else await wait;
  }
}
function beforeAbort(promise, signal) {
  if (signal.aborted) {
    void Promise.resolve(promise).catch(() => {});
    return Promise.reject(new Error("Public request timed out."));
  }
  return new Promise((resolveValue, reject) => {
    const abort = () => reject(new Error("Public request timed out."));
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise)
      .then(resolveValue, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
export function createPublicAssetReader({
  expected,
  mode = "production",
  fixtureOrigin,
  fetchImpl = fetch,
  signal,
}) {
  // Without an expected manifest, only its fixed discovery path is readable.
  const manifest =
      expected === undefined ? null : validateRevisionManifest(expected),
    origin = deploymentSiteOrigin({ mode, fixtureOrigin });
  return async (path) => {
    if (signal?.aborted) throw new Error("Public confirmation timed out.");
    if (
      path !== "revision.json" &&
      (!validSiteAssetPath(path) ||
        !manifest?.assets.some((asset) => asset.path === path))
    )
      throw new Error("Public verification path is invalid.");
    const maximumBytes =
      path === "revision.json"
        ? REVISION_LIMITS.manifestBytes
        : manifest.assets.find((asset) => asset.path === path).bytes;
    const url = new URL(
      `/${path.split("/").map(encodeURIComponent).join("/")}`,
      origin,
    );
    url.searchParams.set(
      "tavernary_verification",
      `${manifest?.sourceSha ?? "manifest"}-${Date.now()}`,
    );
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 20000);
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const response = await beforeAbort(
        fetchImpl(url, {
          redirect: "error",
          cache: "no-store",
          headers: { "cache-control": "no-cache" },
          signal: controller.signal,
        }),
        controller.signal,
      );
      if (!response.ok) throw new Error("Public asset is unavailable.");
      const length = response.headers.get("content-length");
      if (
        length !== null &&
        (!/^\d+$/u.test(length) || Number(length) > maximumBytes)
      )
        integrity();
      const reader = response.body?.getReader();
      if (!reader) return new Uint8Array();
      const chunks = [];
      let count = 0;
      while (true) {
        const { done, value } = await beforeAbort(
          reader.read(),
          controller.signal,
        );
        if (done) break;
        count += value.length;
        if (count > maximumBytes) {
          await reader.cancel();
          integrity();
        }
        chunks.push(value);
      }
      return new Uint8Array(Buffer.concat(chunks, count));
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      controller.abort();
    }
  };
}
export async function confirmPublicDeployment({
  expected,
  mode = "production",
  fixtureOrigin,
  fetchImpl = fetch,
  browserSmoke,
  maxAttempts = 8,
  sleep,
  now = Date.now,
}) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 240000);
  try {
    const fetchAsset = createPublicAssetReader({
      expected,
      mode,
      fixtureOrigin,
      fetchImpl,
      signal: controller.signal,
    });
    const origin = deploymentSiteOrigin({ mode, fixtureOrigin });
    const smoke =
      browserSmoke ??
      (async (input) => {
        const { runEssentialBrowserSmoke } =
          await import("./deployment-browser-smoke.mjs");
        return runEssentialBrowserSmoke({
          ...input,
          origin,
          signal: controller.signal,
        });
      });
    return await beforeAbort(
      pollDeploymentConfirmation({
        maxAttempts,
        sleep,
        signal: controller.signal,
        attempt: () =>
          confirmDeployment({
            expected,
            fetchManifest: async () =>
              JSON.parse(
                new TextDecoder("utf-8", { fatal: true }).decode(
                  await fetchAsset("revision.json"),
                ),
              ),
            fetchCatalog: () => fetchAsset("catalog/tavernary-catalog-v8.json"),
            fetchTargets: () =>
              fetchAsset("security/tavernkeeper-targets.json"),
            fetchAsset,
            browserSmoke: smoke,
            nowMs: now(),
          }),
      }),
      controller.signal,
    );
  } catch {
    return { status: "waiting", reason: "public-unavailable" };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [manifestPath, outputPath, ...flags] = process.argv.slice(2);
  if (
    !manifestPath ||
    !outputPath ||
    flags.some((flag) => flag !== "--fixture")
  )
    throw new Error(
      "Expected a trusted manifest, confirmation output and optional --fixture.",
    );
  const bytes = await readFile(manifestPath);
  if (bytes.length > REVISION_LIMITS.manifestBytes)
    throw new Error("Expected manifest exceeds its bound.");
  const result = await confirmPublicDeployment({
    expected: validateRevisionManifest(JSON.parse(bytes.toString("utf8"))),
    ...(flags.includes("--fixture")
      ? {
          mode: "fixture",
          fixtureOrigin: process.env.TAVERNARY_DEPLOYMENT_FIXTURE_ORIGIN,
        }
      : {}),
  });
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    JSON.stringify({
      status: result.status,
      ...(result.status !== "confirmed"
        ? { reason: result.reason }
        : { sourceSha: result.deployment.sourceSha }),
    }),
  );
  if (result.status !== "confirmed") process.exitCode = 1;
}

import { isDeepStrictEqual } from "node:util";

const day = 86_400_000;
const majorPattern = /^v(?:0\.(?:8|10|12)|[1-9]\d*)$/u;

export function validateSupportedRuntimes(value) {
  if (
    !value ||
    Object.keys(value).sort().join(",") !==
      "productionMajor,schemaVersion,warningDays" ||
    value.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.productionMajor) ||
    value.productionMajor < 24 ||
    value.productionMajor > 1000 ||
    value.warningDays !== 90
  )
    throw new Error("Supported runtime policy is invalid.");
  return value;
}

export function validateOfficialNodeSchedule(value) {
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== "object" ||
    !Object.keys(value).length ||
    Object.keys(value).length > 1000
  )
    throw new Error("Official runtime schedule is invalid.");
  const date = (text) => {
    if (
      typeof text !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/u.test(text) ||
      new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) !== text
    )
      throw new Error("Official runtime schedule date is invalid.");
    return Date.parse(`${text}T00:00:00Z`);
  };
  const entries = [];
  for (const [key, record] of Object.entries(value)) {
    if (
      !majorPattern.test(key) ||
      !record ||
      typeof record !== "object" ||
      Array.isArray(record)
    )
      throw new Error("Official runtime schedule release is invalid.");
    const major = key.startsWith("v0.") ? 0 : Number(key.slice(1));
    if (!Number.isSafeInteger(major) || major > 1000)
      throw new Error("Official runtime schedule major is invalid.");
    const start = date(record.start),
      end = date(record.end);
    const lts =
      record.lts === false || record.lts === undefined
        ? null
        : date(record.lts);
    const maintenance =
      record.maintenance === undefined ? null : date(record.maintenance);
    if (
      start >= end ||
      (lts !== null && (lts < start || lts >= end)) ||
      (maintenance !== null &&
        (maintenance < (lts ?? start) || maintenance > end))
    )
      throw new Error("Official runtime schedule dates disagree.");
    entries.push({ major, start, lts, maintenance, end });
  }
  return entries.sort((a, b) => a.major - b.major);
}

export function planRuntimeTransition({
  supported,
  officialSchedule,
  candidateResults = [],
  nowMs,
}) {
  const policy = validateSupportedRuntimes(supported);
  if (
    !Number.isSafeInteger(nowMs) ||
    !Number.isFinite(new Date(nowMs).getTime()) ||
    !Array.isArray(candidateResults) ||
    candidateResults.length > 20
  )
    throw new Error("Runtime observations are invalid.");
  const releases = validateOfficialNodeSchedule(officialSchedule);
  const current = releases.find(
    (entry) => entry.major === policy.productionMajor,
  );
  if (!current || current.lts === null || current.lts > nowMs)
    throw new Error("Production runtime has no official LTS support.");
  const next = releases.find(
    (entry) =>
      entry.major > current.major &&
      entry.lts !== null &&
      entry.lts <= nowMs &&
      nowMs < entry.end,
  );
  const healthy = nowMs < current.end;
  const verified =
    next &&
    candidateResults.some(
      (result) =>
        result.major === next.major &&
        /^[a-f0-9]{40}$/u.test(result.baseSha ?? "") &&
        /^[a-f0-9]{40}$/u.test(result.headSha ?? "") &&
        result.currentVerified === true &&
        result.candidateVerified === true &&
        result.coupledDiffVerified === true,
    );
  const warning = current.end - nowMs <= policy.warningDays * day;
  const action = verified
    ? "transition"
    : !healthy || warning
      ? "incident"
      : next
        ? "verify"
        : "keep";
  return {
    action,
    healthy,
    reason: !healthy
      ? "runtime-eol"
      : warning && !verified
        ? "runtime-eol-soon"
        : next
          ? verified
            ? "runtime-transition-verified"
            : "runtime-verification-pending"
          : "runtime-supported",
    currentMajor: current.major,
    ...(next ? { candidateMajor: next.major } : {}),
    supportEnds: new Date(current.end).toISOString(),
  };
}

export const RUNTIME_PROPOSAL_PATHS = Object.freeze([
  ".node-version",
  "config/supported-runtimes.json",
  "docs/maintenance/supported-runtime.md",
  "package.json",
  "package-lock.json",
]);

export function runtimeDocumentation(major) {
  validateSupportedRuntimes({
    schemaVersion: 1,
    productionMajor: major,
    warningDays: 90,
  });
  return `# Supported runtime\n\nProduction builds and automation use Node ${major} LTS, selected through\n.node-version and config/supported-runtimes.json. Node declarations use the\nsame major. The official Node release schedule on GitHub determines support.\n\nWeekly compatibility checks cover the current and next stable LTS, including\nstatic, unit, build, browser and visual checks. A constrained runtime PR must\npass full checks for its exact head and the current runtime before merging.\nFailed candidates preserve the working runtime and deployed bundle.\n\nAn incident warns 90 days before support ends without a verified successor.\nAn expired runtime remains unhealthy until a supported transition is merged.\nGitHub outages or disabled schedules require the owner to restore automation.\n`;
}

export function inspectRuntimeProposal({ before, after, candidateMajor }) {
  const paths = RUNTIME_PROPOSAL_PATHS.toSorted();
  for (const files of [before, after])
    if (
      !files ||
      !isDeepStrictEqual(Object.keys(files).sort(), paths) ||
      Object.values(files).some(
        (text) =>
          typeof text !== "string" || Buffer.byteLength(text) > 8_388_608,
      )
    )
      throw new Error("Runtime proposal paths are invalid.");
  const current = validateSupportedRuntimes(
    JSON.parse(before["config/supported-runtimes.json"]),
  );
  const next = validateSupportedRuntimes(
    JSON.parse(after["config/supported-runtimes.json"]),
  );
  if (
    candidateMajor <= current.productionMajor ||
    next.productionMajor !== candidateMajor ||
    before[".node-version"] !== `${current.productionMajor}\n` ||
    after[".node-version"] !== `${candidateMajor}\n` ||
    before["docs/maintenance/supported-runtime.md"] !==
      runtimeDocumentation(current.productionMajor) ||
    after["docs/maintenance/supported-runtime.md"] !==
      runtimeDocumentation(candidateMajor)
  )
    throw new Error("Runtime coupled policy changed.");
  const oldPackage = JSON.parse(before["package.json"]),
    nextPackage = JSON.parse(after["package.json"]);
  const expectedPackage = structuredClone(oldPackage);
  expectedPackage.engines = {
    node: `>=${candidateMajor} <${candidateMajor + 1}`,
  };
  expectedPackage.devDependencies["@types/node"] = `^${candidateMajor}.0.0`;
  if (
    !isDeepStrictEqual(nextPackage, expectedPackage) ||
    !isDeepStrictEqual(oldPackage.engines, {
      node: `>=${current.productionMajor} <${current.productionMajor + 1}`,
    })
  )
    throw new Error("Runtime package policy changed.");
  const oldLock = JSON.parse(before["package-lock.json"]),
    nextLock = JSON.parse(after["package-lock.json"]);
  const root = nextLock.packages?.[""],
    types = nextLock.packages?.["node_modules/@types/node"];
  if (
    oldLock.lockfileVersion !== 3 ||
    nextLock.lockfileVersion !== 3 ||
    !root ||
    !isDeepStrictEqual(root.engines, expectedPackage.engines) ||
    !isDeepStrictEqual(root.devDependencies, expectedPackage.devDependencies) ||
    !types ||
    !new RegExp(`^${candidateMajor}\\.\\d+\\.\\d+$`, "u").test(
      types.version ?? "",
    )
  )
    throw new Error("Runtime lock or types disagree.");
  const permitted = ["node_modules/@types/node", "node_modules/undici-types"];
  for (const path of permitted) {
    const value = nextLock.packages[path];
    if (!value) continue;
    let url;
    try {
      url = new URL(value.resolved);
    } catch {
      throw new Error("Runtime types provenance is invalid.");
    }
    const expectedPrefix =
      path === permitted[0]
        ? "/@types/node/-/node-"
        : "/undici-types/-/undici-types-";
    if (
      value.dev !== true ||
      value.link ||
      value.hasInstallScript ||
      !/^\d+\.\d+\.\d+$/u.test(value.version ?? "") ||
      !/^sha512-[A-Za-z0-9+/]+=*$/u.test(value.integrity ?? "") ||
      url.protocol !== "https:" ||
      url.host !== "registry.npmjs.org" ||
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      url.pathname !== `${expectedPrefix}${value.version}.tgz`
    )
      throw new Error("Runtime types provenance is invalid.");
  }
  const normalize = (lock) => {
    const value = structuredClone(lock);
    delete value.packages[""].engines;
    delete value.packages[""].devDependencies["@types/node"];
    for (const path of permitted) delete value.packages[path];
    return value;
  };
  if (!isDeepStrictEqual(normalize(oldLock), normalize(nextLock)))
    throw new Error("Runtime lock policy changed.");
  return { currentMajor: current.productionMajor, candidateMajor };
}

import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { format } from "prettier";

import { buildCatalog } from "./build.mjs";
import { refreshExtensionInstallEvidence } from "./extension-install-evidence.mjs";
import { buildRefreshManifest } from "./github-refresh-manifest.mjs";
import { repositoryProvider } from "./repository-provider.mjs";
import {
  contributorSnapshotForFailure,
  contributorSnapshotForSuccess,
  snapshotForFailure,
  runRefresh as runGitHubRefresh,
} from "./refresh-github.mjs";
import {
  normalizedLicense,
  provisionalActivity,
  snapshotFromObservation,
} from "./repository-snapshot.mjs";
import { validateCatalog } from "./validate.mjs";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = resolve(
  rootDirectory,
  "data/snapshots/github-refresh.json",
);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readDirectory(path) {
  try {
    const files = (await readdir(path))
      .filter((file) => file.endsWith(".json"))
      .sort();
    return Promise.all(files.map((file) => readJson(resolve(path, file))));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function readInputs() {
  const [records, projects, installEvidence] = await Promise.all([
    readDirectory(resolve(rootDirectory, "data/registry/sources")),
    readDirectory(resolve(rootDirectory, "data/registry/projects")),
    readDirectory(resolve(rootDirectory, "data/snapshots/install")),
  ]);
  const snapshots = (
    await Promise.all(
      ["github", "codeberg"].map((provider) =>
        readDirectory(resolve(rootDirectory, `data/snapshots/${provider}`)),
      ),
    )
  ).flat();
  let previousManifest = null;
  try {
    previousManifest = await readJson(manifestPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return { records, projects, snapshots, installEvidence, previousManifest };
}

function automaticRecords(records) {
  return records
    .filter(
      (record) =>
        (record.type === "github" || record.type === "codeberg") &&
        record.status === "active" &&
        record.refresh_policy === "automatic",
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function selectRefreshSources(records, snapshots, options) {
  const automatic = automaticRecords(records);
  const snapshotsById = new Map(
    snapshots.map((snapshot) => [snapshot.source_id, snapshot]),
  );
  const mode = options.mode ?? "incremental";
  if (mode === "incremental") return automatic;
  if (mode === "baseline") {
    const batchSize = options.batchSize ?? 12;
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 24) {
      throw new Error("Baseline batch size must be between 1 and 24");
    }
    return automatic
      .filter(
        ({ id }) =>
          snapshotsById.get(id)?.activity?.evidence_status !== "complete",
      )
      .slice(0, batchSize);
  }
  if (mode === "project" || mode === "forensic") {
    const sourceIds = [
      ...new Set(
        (options.sourceIds ?? (options.sourceId ? [options.sourceId] : []))
          .filter(Boolean)
          .map(String),
      ),
    ];
    if (sourceIds.length === 0) {
      throw new Error(`${mode} mode requires source_id`);
    }
    if (mode === "forensic" && sourceIds.length !== 1) {
      throw new Error("forensic mode requires exactly one source_id");
    }
    const requested = new Set(sourceIds);
    const selected = automatic.filter(({ id }) => requested.has(id));
    const selectedIds = new Set(selected.map(({ id }) => id));
    const missing = sourceIds.filter((id) => !selectedIds.has(id));
    if (missing.length > 0) {
      throw new Error(`Unknown refreshable source: ${missing.join(", ")}`);
    }
    return selected;
  }
  throw new Error(`Unknown refresh mode: ${mode}`);
}

function changed(candidate, previous) {
  return JSON.stringify(candidate) !== JSON.stringify(previous);
}

function failureOutcome(record, previous, now, error) {
  const candidate = snapshotForFailure(previous, error, now);
  return {
    snapshot: candidate,
    outcome: {
      sourceId: record.id,
      provider: record.type,
      result: "failed",
      durationMs: 0,
      snapshotChanged: changed(candidate, previous),
      errorCode:
        error?.status === 429 ? "RATE_LIMITED" : "PROVIDER_REFRESH_FAILED",
    },
  };
}

async function refreshCodebergGroup(provider, records, snapshots, now) {
  const snapshotsById = new Map(
    snapshots.map((snapshot) => [
      snapshot.source_id,
      structuredClone(snapshot),
    ]),
  );
  const outcomes = [];
  let requests = 0;
  let remaining = null;
  let observed;
  try {
    observed = await provider.observe(records);
    requests += observed.usage.requestCount;
    remaining = observed.usage.remainingPoints;
  } catch (error) {
    for (const record of records) {
      const result = failureOutcome(
        record,
        snapshotsById.get(record.id) ?? null,
        now,
        error,
      );
      if (result.snapshot) snapshotsById.set(record.id, result.snapshot);
      outcomes.push(result.outcome);
    }
    return {
      snapshots: [...snapshotsById.values()],
      outcomes,
      usage: {
        requests: Math.max(1, requests),
        remaining: error?.status === 429 ? 0 : remaining,
      },
    };
  }

  const observationsById = new Map(
    observed.observations.map((entry) => [entry.sourceId, entry]),
  );
  const failuresById = new Map(
    observed.failures.map((entry) => [entry.sourceId, entry]),
  );
  for (const record of records) {
    const started = Date.now();
    const previous = snapshotsById.get(record.id) ?? null;
    if (remaining === 0) {
      const result = failureOutcome(
        record,
        previous,
        now,
        Object.assign(new Error("Codeberg request budget exhausted"), {
          status: 429,
        }),
      );
      if (result.snapshot) snapshotsById.set(record.id, result.snapshot);
      outcomes.push(result.outcome);
      continue;
    }
    const observation = observationsById.get(record.id);
    if (!observation) {
      const failure = failuresById.get(record.id);
      const result = failureOutcome(record, previous, now, {
        status: failure?.kind === "unavailable" ? 404 : 409,
      });
      if (result.snapshot) snapshotsById.set(record.id, result.snapshot);
      outcomes.push(result.outcome);
      continue;
    }
    try {
      const activity = await provider.inspectActivity({
        repository: record.repository,
        expectedHeadSha: observation.repository.headSha,
        now,
        activity: previous?.activity ?? provisionalActivity(),
        scan: previous?.activity_scan ?? null,
      });
      requests += activity.requestCount ?? 0;
      const contributorResult = await provider.collectContributors(
        {
          ...observation.repository,
          headSha: observation.repository.headSha,
        },
        { now, previous: previous?.contributors ?? null },
      );
      requests += contributorResult.requestCount ?? 0;
      const candidate = snapshotFromObservation({
        provider: "codeberg",
        sourceId: record.id,
        observation,
        previous,
        now,
        contributors: contributorSnapshotForSuccess(
          contributorResult,
          now,
          "codeberg",
        ),
      });
      candidate.activity = activity.activity;
      candidate.activity.evidence_head_sha = observation.repository.headSha;
      if (activity.license) {
        candidate.license = normalizedLicense(activity.license);
      }
      if (Object.hasOwn(activity, "scan")) {
        candidate.activity_scan = activity.scan;
      }
      snapshotsById.set(record.id, candidate);
      outcomes.push({
        sourceId: record.id,
        provider: "codeberg",
        result: previous ? "compare-source" : "baseline",
        durationMs: Math.max(0, Date.now() - started),
        snapshotChanged: changed(candidate, previous),
      });
    } catch (error) {
      requests += error?.requestCount ?? 1;
      const result = failureOutcome(record, previous, now, error);
      if (result.snapshot) {
        result.snapshot.contributors = contributorSnapshotForFailure(
          previous?.contributors,
          now,
        );
        snapshotsById.set(record.id, result.snapshot);
      }
      outcomes.push(result.outcome);
      if (error?.status === 429 || error?.rateLimited) remaining = 0;
    }
  }
  return {
    snapshots: [...snapshotsById.values()],
    outcomes,
    usage: { requests, remaining },
  };
}

export async function publishRepositoryCandidates(
  { changedSnapshots, changedInstallEvidence = [], manifest },
  options = {},
) {
  const write = options.writeFile ?? writeFile;
  for (const snapshot of changedSnapshots) {
    const provider = snapshot.provider;
    if (provider !== "github" && provider !== "codeberg") {
      throw new Error(`Cannot publish unknown snapshot provider: ${provider}`);
    }
    const directory = resolve(
      options.rootDirectory ?? rootDirectory,
      `data/snapshots/${provider}`,
    );
    await mkdir(directory, { recursive: true });
    await write(
      resolve(directory, `${snapshot.source_id}.json`),
      await format(JSON.stringify(snapshot), { parser: "json" }),
      "utf8",
    );
  }
  await write(
    options.manifestPath ?? manifestPath,
    await format(JSON.stringify(manifest), { parser: "json" }),
    "utf8",
  );
  await publishInstallEvidence(changedInstallEvidence, options);
}

async function publishInstallEvidence(changedEvidence, options = {}) {
  const write = options.writeFile ?? writeFile;
  const move = options.rename ?? rename;
  const remove = options.rm ?? rm;
  const directory = resolve(
    options.rootDirectory ?? rootDirectory,
    "data/snapshots/install",
  );
  await mkdir(directory, { recursive: true });
  for (const evidence of changedEvidence) {
    const destination = resolve(directory, `${evidence.source_id}.json`);
    const temporary = `${destination}.tmp-${randomUUID()}`;
    try {
      await write(
        temporary,
        await format(JSON.stringify(evidence), { parser: "json" }),
        "utf8",
      );
      await move(temporary, destination);
    } catch (error) {
      await remove(temporary, { force: true });
      throw error;
    }
  }
}

export async function runRepositoryRefresh(options = {}) {
  const mode = options.mode ?? "incremental";
  const startedAt = new Date(options.startedAt ?? Date.now()).toISOString();
  const now = new Date(options.now ?? startedAt).toISOString();
  const needsCanonicalInputs =
    options.records === undefined ||
    options.snapshots === undefined ||
    (options.write !== false && options.projects === undefined);
  const canonicalInputs = needsCanonicalInputs ? await readInputs() : null;
  const inputs = {
    records: options.records ?? canonicalInputs.records,
    projects: options.projects ?? canonicalInputs?.projects ?? [],
    snapshots: options.snapshots ?? canonicalInputs.snapshots,
    installEvidence:
      options.installEvidence ?? canonicalInputs?.installEvidence ?? [],
    previousManifest:
      options.previousManifest ?? canonicalInputs?.previousManifest ?? null,
  };
  const selected = selectRefreshSources(inputs.records, inputs.snapshots, {
    mode,
    batchSize: options.batchSize,
    sourceId: options.sourceId,
    sourceIds: options.sourceIds,
  });
  const selectedByProvider = new Map(
    ["github", "codeberg"].map((provider) => [
      provider,
      selected.filter((record) => record.type === provider),
    ]),
  );
  const snapshotsByProvider = new Map(
    ["github", "codeberg"].map((provider) => [
      provider,
      inputs.snapshots.filter((snapshot) => snapshot.provider === provider),
    ]),
  );
  const outcomes = [];
  const providerUsage = {};
  const aggregateUsage = {
    graphqlRequests: 0,
    graphqlPoints: 0,
    graphqlRemaining: null,
    restRequests: 0,
  };
  const finalSnapshots = [];

  const githubRecords = selectedByProvider.get("github");
  if (githubRecords.length > 0) {
    const github = await (options.runGitHubRefresh ?? runGitHubRefresh)({
      ...options,
      records: githubRecords,
      snapshots: snapshotsByProvider.get("github"),
      previousManifest: inputs.previousManifest,
      write: false,
    });
    finalSnapshots.push(...github.snapshots);
    outcomes.push(
      ...github.manifest.source_timings.map((entry) => ({
        sourceId: entry.source_id,
        provider: "github",
        result: entry.outcome,
        durationMs: entry.duration_ms,
        errorCode: entry.error_code,
        snapshotChanged: github.changedSnapshots.some(
          (snapshot) => snapshot.source_id === entry.source_id,
        ),
      })),
    );
    providerUsage.github = {
      requests:
        github.manifest.api.graphql_requests +
        github.manifest.api.rest_requests,
      remaining: github.manifest.api.graphql_remaining,
    };
    aggregateUsage.graphqlRequests = github.manifest.api.graphql_requests;
    aggregateUsage.graphqlPoints = github.manifest.api.graphql_points;
    aggregateUsage.graphqlRemaining = github.manifest.api.graphql_remaining;
    aggregateUsage.restRequests = github.manifest.api.rest_requests;
  } else {
    finalSnapshots.push(...snapshotsByProvider.get("github"));
    providerUsage.github = { requests: 0, remaining: null };
  }

  const codebergRecords = selectedByProvider.get("codeberg");
  if (codebergRecords.length > 0) {
    const provider =
      options.providers?.codeberg ??
      repositoryProvider("codeberg", options.clients);
    const codeberg = await refreshCodebergGroup(
      provider,
      codebergRecords,
      snapshotsByProvider.get("codeberg"),
      now,
    );
    finalSnapshots.push(...codeberg.snapshots);
    outcomes.push(...codeberg.outcomes);
    providerUsage.codeberg = codeberg.usage;
    aggregateUsage.restRequests += codeberg.usage.requests;
  } else {
    finalSnapshots.push(...snapshotsByProvider.get("codeberg"));
    providerUsage.codeberg = { requests: 0, remaining: null };
  }

  finalSnapshots.sort((left, right) =>
    left.source_id.localeCompare(right.source_id),
  );
  outcomes.sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  const completedAt = new Date(
    options.completedAt ?? (options.now ? now : Date.now()),
  ).toISOString();
  const manifest = buildRefreshManifest({
    mode,
    startedAt,
    completedAt,
    outcomes,
    snapshots: finalSnapshots,
    usage: aggregateUsage,
    providers: providerUsage,
    deploymentRequested: options.deploymentRequested,
  });
  const previousById = new Map(
    inputs.snapshots.map((snapshot) => [snapshot.source_id, snapshot]),
  );
  const changedSnapshots = finalSnapshots.filter((snapshot) =>
    changed(snapshot, previousById.get(snapshot.source_id)),
  );
  const evidenceProviders = {};
  for (const providerName of ["github", "codeberg"]) {
    if (selectedByProvider.get(providerName).length > 0) {
      evidenceProviders[providerName] =
        options.providers?.[providerName] ??
        repositoryProvider(providerName, options.clients);
    }
  }
  const evidenceRefresh = await (
    options.refreshInstallEvidence ?? refreshExtensionInstallEvidence
  )({
    projects: inputs.projects,
    sources: inputs.records,
    snapshots: finalSnapshots,
    previousEvidence: inputs.installEvidence,
    sourceIds: selected.map((record) => record.id),
    providers: evidenceProviders,
    observedAt: completedAt,
  });

  if (options.write !== false) {
    const validation = await (options.validateCandidates ?? validateCatalog)({
      records: inputs.projects,
      sources: inputs.records,
      snapshots: finalSnapshots,
      installEvidence: evidenceRefresh.evidence,
      refreshManifest: manifest,
    });
    if (validation?.errors?.length > 0) {
      throw new Error(
        `Candidate catalog validation failed:\n${validation.errors.join("\n")}`,
      );
    }
    await (options.buildCandidates ?? buildCatalog)({
      write: false,
      records: inputs.projects,
      sources: inputs.records,
      snapshots: finalSnapshots,
      installEvidence: evidenceRefresh.evidence,
      refreshManifest: manifest,
    });
    await (options.publish ?? publishRepositoryCandidates)({
      changedSnapshots,
      changedInstallEvidence: evidenceRefresh.changedEvidence,
      manifest,
    });
  }
  return {
    selected,
    snapshots: finalSnapshots,
    changedSnapshots,
    installEvidence: evidenceRefresh.evidence,
    changedInstallEvidence: evidenceRefresh.changedEvidence,
    manifest,
  };
}

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

function argumentsFor(name) {
  return process.argv.flatMap((value, index) =>
    value === name && process.argv[index + 1] !== undefined
      ? [process.argv[index + 1]]
      : [],
  );
}

async function main() {
  const mode = argument("--mode", "incremental");
  const result = await runRepositoryRefresh({
    mode,
    batchSize: Number(argument("--batch-size", "12")),
    sourceId: argument("--source-id"),
    sourceIds: argumentsFor("--source-id"),
    deploymentRequested: process.argv.includes("--deployment-requested"),
  });
  console.log(
    `Repository refresh complete: ${result.manifest.counts.changed} changed`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}

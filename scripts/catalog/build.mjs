import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outputPath = resolve(rootDirectory, "src/generated/catalog.json");

async function readJson(path) {
  return JSON.parse(await readFile(resolve(rootDirectory, path), "utf8"));
}

async function readJsonDirectory(path) {
  const directory = resolve(rootDirectory, path);
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  return Promise.all(files.map((file) => readJson(`${path}/${file}`)));
}

function labelsById(vocabulary, property) {
  return new Map(vocabulary[property].map((item) => [item.id, item.label]));
}

function labeled(ids, labels) {
  return ids.map((id) => ({ id, label: labels.get(id) ?? id }));
}

function twoWeekBars(weeks) {
  return [
    weeks[0] + weeks[1],
    weeks[2] + weeks[3],
    weeks[4] + weeks[5],
    weeks[6] + weeks[7],
    weeks[8] + weeks[9],
    weeks[10] + weeks[11],
  ];
}

function emptyActivity() {
  return {
    latestMeaningfulCommitAt: null,
    activeWeeks12: null,
    twoWeekBars: null,
    strength: null,
    dormant: false,
  };
}

function licenseDisplay(status, spdxId, sourceType = "github") {
  if (status === "osi-approved") {
    return {
      status,
      label: spdxId ?? "Open source",
      tooltip:
        sourceType === "github"
          ? "OSI-approved license detected in the repository root."
          : "The source is marked with an OSI-approved license.",
    };
  }
  if (status === "proprietary") {
    return {
      status,
      label: "Proprietary",
      tooltip:
        sourceType === "github"
          ? "The published root license is not OSI-approved."
          : "The source is marked proprietary.",
    };
  }
  if (status === "pending") {
    return {
      status,
      label: "Pending",
      tooltip:
        sourceType === "github"
          ? "Repository facts are pending the first successful snapshot."
          : "License review is pending for this source.",
    };
  }
  return {
    status: "missing",
    label: "Missing",
    tooltip:
      sourceType === "github"
        ? "No license file was found in the repository root."
        : "No license information is published for this source.",
  };
}

function githubProject(record, snapshot, vocabularies) {
  const frontends = labeled(record.frontends, vocabularies.frontends);
  const capabilities = labeled(record.capabilities, vocabularies.capabilities);
  const primaryFunction = {
    id: record.primary_function,
    label:
      vocabularies.primaryFunctions.get(record.primary_function) ??
      record.primary_function,
  };
  const searchableText = [
    record.name,
    record.kind,
    record.summary,
    primaryFunction.label,
    ...frontends.map(({ label }) => label),
    ...capabilities.map(({ label }) => label),
  ]
    .join(" ")
    .toLowerCase();

  return {
    id: record.id,
    name: record.name,
    kind: record.kind,
    metadataStatus: record.metadata_status,
    sourceStatus: snapshot
      ? snapshot.stale_since || snapshot.source_health === "unavailable"
        ? "stale"
        : "healthy"
      : "pending",
    primaryFunction: primaryFunction.id,
    summary: record.summary,
    canonicalUrl:
      snapshot?.repository?.url ??
      `https://github.com/${record.source.repository}`,
    catalogedAt: record.cataloged_at,
    catalogCohort: record.catalog_cohort,
    frontends,
    capabilities,
    searchableText,
    activity: snapshot
      ? {
          latestMeaningfulCommitAt: snapshot.activity.latest_meaningful_commit_at,
          activeWeeks12: snapshot.activity.active_weeks_12,
          twoWeekBars: twoWeekBars(snapshot.activity.weekly_meaningful_commits),
          strength: snapshot.activity.strength,
          dormant: snapshot.activity.dormant,
        }
      : emptyActivity(),
    latestReleaseAt: snapshot?.activity?.latest_release_at ?? null,
    community: snapshot
      ? {
          stars: snapshot.community.stargazers_count,
          forks: snapshot.community.forks_count,
          subscribers: snapshot.community.subscribers_count,
          aggregate:
            snapshot.community.stargazers_count +
            snapshot.community.forks_count +
            snapshot.community.subscribers_count,
        }
      : null,
    repositorySizeKb: snapshot?.repository?.size_kb ?? null,
    license: snapshot
      ? licenseDisplay(snapshot.license.status, snapshot.license.spdx_id)
      : licenseDisplay("pending", null),
    preset:
      record.kind === "preset"
        ? {
            version: null,
            publishedAt: null,
            artifactSizeBytes: null,
          }
        : null,
    refreshedAt: snapshot?.refreshed_at ?? null,
    staleSince: snapshot?.stale_since ?? null,
  };
}

function urlPreset(record, vocabularies) {
  const frontends = labeled(record.frontends, vocabularies.frontends);
  const capabilities = labeled(record.capabilities, vocabularies.capabilities);
  const primaryFunction = {
    id: record.primary_function,
    label:
      vocabularies.primaryFunctions.get(record.primary_function) ??
      record.primary_function,
  };
  const license = licenseDisplay(
    record.source.license_status,
    record.source.license_spdx_id,
    "url",
  );

  return {
    id: record.id,
    name: record.name,
    kind: record.kind,
    metadataStatus: record.metadata_status,
    sourceStatus: "manual",
    primaryFunction: primaryFunction.id,
    summary: record.summary,
    canonicalUrl: record.source.url,
    catalogedAt: record.cataloged_at,
    catalogCohort: record.catalog_cohort,
    frontends,
    capabilities,
    searchableText: [
      record.name,
      record.kind,
      record.summary,
      primaryFunction.label,
      ...frontends.map(({ label }) => label),
      ...capabilities.map(({ label }) => label),
    ]
      .join(" ")
      .toLowerCase(),
    activity: emptyActivity(),
    latestReleaseAt: null,
    community: null,
    repositorySizeKb: null,
    license,
    preset: {
      version: record.source.version,
      publishedAt: record.source.published_at,
      artifactSizeBytes: record.source.artifact_size_bytes,
    },
    refreshedAt: null,
    staleSince: null,
  };
}

function manualProject(record, vocabularies) {
  const frontends = labeled(record.frontends, vocabularies.frontends);
  const capabilities = labeled(record.capabilities, vocabularies.capabilities);
  const primaryFunction = {
    id: record.primary_function,
    label:
      vocabularies.primaryFunctions.get(record.primary_function) ??
      record.primary_function,
  };

  return {
    id: record.id,
    name: record.name,
    kind: record.kind,
    metadataStatus: record.metadata_status,
    sourceStatus: "manual",
    primaryFunction: primaryFunction.id,
    summary: record.summary,
    canonicalUrl: record.source.url,
    catalogedAt: record.cataloged_at,
    catalogCohort: record.catalog_cohort,
    frontends,
    capabilities,
    searchableText: [
      record.name,
      record.kind,
      record.summary,
      primaryFunction.label,
      ...frontends.map(({ label }) => label),
      ...capabilities.map(({ label }) => label),
    ]
      .join(" ")
      .toLowerCase(),
    activity: emptyActivity(),
    latestReleaseAt: null,
    community: null,
    repositorySizeKb: null,
    license: licenseDisplay("pending", null, "url"),
    preset: null,
    refreshedAt: null,
    staleSince: null,
  };
}

export async function buildCatalog(options = {}) {
  const [
    records,
    snapshots,
    frontendVocabulary,
    primaryFunctionVocabulary,
    capabilityVocabulary,
  ] = await Promise.all([
    options.records ?? readJsonDirectory("data/registry/projects"),
    options.snapshots ?? readJsonDirectory("data/snapshots/github"),
    readJson("data/vocabularies/frontends.json"),
    readJson("data/vocabularies/primary-functions.json"),
    readJson("data/vocabularies/capabilities.json"),
  ]);
  const vocabularies = {
    frontends: labelsById(frontendVocabulary, "frontends"),
    primaryFunctions: labelsById(
      primaryFunctionVocabulary,
      "primary_functions",
    ),
    capabilities: labelsById(capabilityVocabulary, "capabilities"),
  };
  const snapshotsByProject = new Map(
    snapshots.map((snapshot) => [snapshot.project_id, snapshot]),
  );
  const projects = [];
  const hiddenSourceStates = new Set(["identity-change", "deleted", "private"]);

  for (const record of records) {
    if (record.visibility !== "published") {
      continue;
    }
    const snapshot = snapshotsByProject.get(record.id);
    if (snapshot && hiddenSourceStates.has(snapshot.source_health)) {
      continue;
    }
    if (record.source.type === "url") {
      if (record.kind === "preset") {
        projects.push(urlPreset(record, vocabularies));
      }
      continue;
    }
    if (record.source.type === "github-organization") {
      projects.push(manualProject(record, vocabularies));
      continue;
    }

    if (!snapshot) {
      projects.push(githubProject(record, null, vocabularies));
      continue;
    }
    projects.push(githubProject(record, snapshot, vocabularies));
  }

  projects.sort((left, right) => left.id.localeCompare(right.id));
  const sourceTimestamps = [
    ...records.map((record) => record.cataloged_at),
    ...snapshots.map((snapshot) => snapshot.refreshed_at),
  ].filter(Boolean);
  const generatedAt =
    options.now ??
    sourceTimestamps
      .map((timestamp) => new Date(timestamp).getTime())
      .filter(Number.isFinite)
      .sort((left, right) => right - left)[0] ??
    0;
  const catalog = {
    schemaVersion: 1,
    generatedAt: new Date(generatedAt).toISOString(),
    projects,
  };

  if (options.write !== false) {
    await mkdir(dirname(outputPath), { recursive: true });
    const temporaryPath = `${outputPath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(catalog, null, 2)}\n`);
    await rename(temporaryPath, outputPath);
  }

  return catalog;
}

async function main() {
  const catalog = await buildCatalog();
  console.log(`Built ${catalog.projects.length} projects`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}

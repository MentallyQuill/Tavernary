import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { classificationError } from "../../src/features/catalog/primary-function-contract.mjs";
import { effectiveListingState } from "../../src/features/catalog/listing-state.mjs";
import { canonicalSourceUrl } from "../../src/features/catalog/source-record.mjs";
import { catalogAttribution } from "../../src/lib/github/contributors.ts";
import { derivePublicActivity } from "./activity-evidence.mjs";
import { resolveForkRelationship } from "./fork-relationship.mjs";
import { indexRegistry } from "./registry-context.mjs";
import { effectiveVoteAt, trendingScore } from "../kits/trending.mjs";

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

async function readOptionalJsonDirectory(path) {
  try {
    return await readJsonDirectory(path);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function entriesById(vocabulary, property) {
  return new Map(vocabulary[property].map((item) => [item.id, item]));
}

function labeled(ids, entries) {
  return ids.map((id) => {
    const entry = entries.get(id);
    return {
      id,
      label: entry?.label ?? id,
      description:
        entry?.description ?? `Catalog metadata: ${entry?.label ?? id}.`,
    };
  });
}

function tagged(ids, entries) {
  return ids.map((id) => {
    const entry = entries.get(id);
    return {
      id,
      label: entry?.label ?? id,
      description: entry?.description ?? `Catalog tag: ${entry?.label ?? id}.`,
      facet: entry?.facet ?? "goal",
    };
  });
}

function presetCompatibility(record, vocabularies) {
  return {
    modelFamilies: labeled(
      record.model_families ?? [],
      vocabularies.modelFamilies,
    ),
    completionFormats: labeled(
      record.completion_formats ?? [],
      vocabularies.completionFormats,
    ),
  };
}

function vocabularyAliases(ids, entries) {
  return ids.flatMap((id) => entries.get(id)?.aliases ?? []);
}

function unique(items) {
  return [...new Set(items)];
}

function emptyActivity() {
  return {
    latestSourceActivityAt: null,
    activeWeeks12: null,
    weeklyActivity: null,
    evidenceStatus: null,
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

function repositoryProject(record, source, snapshot, vocabularies, now) {
  const frontends = labeled(record.frontends, vocabularies.frontends);
  const tags = tagged(record.tags, vocabularies.tags);
  const compatibility = presetCompatibility(record, vocabularies);
  const primaryFunction = {
    id: record.primary_function,
    label:
      vocabularies.primaryFunctions.get(record.primary_function)?.label ??
      record.primary_function,
  };
  const owner = snapshot?.repository?.owner ?? source.repository.split("/")[0];
  const attribution = catalogAttribution(
    source.type,
    owner,
    snapshot?.contributors,
  );
  const searchableText = [
    record.name,
    record.kind,
    record.summary,
    primaryFunction.label,
    ...frontends.map(({ label }) => label),
    ...tags.map(({ label }) => label),
    ...compatibility.modelFamilies.map(({ label }) => label),
    ...compatibility.completionFormats.map(({ label }) => label),
    ...vocabularyAliases(
      record.model_families ?? [],
      vocabularies.modelFamilies,
    ),
    ...vocabularyAliases(record.tags, vocabularies.tags),
    attribution.owner.login,
    attribution.owner.provider,
    ...attribution.contributors.map(({ login }) => login),
  ]
    .join(" ")
    .toLowerCase();

  const derivedActivity = snapshot
    ? derivePublicActivity(snapshot.activity, now)
    : null;
  const weeklyActivity = snapshot
    ? snapshot.activity.evidence_status === "provisional"
      ? snapshot.activity.provisional_weeks
      : (snapshot.activity.provisional_weeks ?? derivedActivity.weeklyActivity)
    : null;
  const activeWeeks12 = weeklyActivity?.filter(Boolean).length ?? null;

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
    canonicalUrl: snapshot?.repository?.url ?? canonicalSourceUrl(source),
    catalogedAt: record.cataloged_at,
    catalogCohort: record.catalog_cohort,
    frontends,
    tags,
    searchableText,
    attribution,
    activity: snapshot
      ? {
          latestSourceActivityAt: snapshot.activity.latest_source_activity_at,
          activeWeeks12,
          weeklyActivity,
          evidenceStatus: snapshot.activity.evidence_status,
          dormant: derivedActivity.dormant,
        }
      : emptyActivity(),
    latestReleaseAt: snapshot?.activity?.latest_release_at ?? null,
    community: snapshot
      ? {
          stars: snapshot.community.stars_count,
          forks: snapshot.community.forks_count,
          watchers: snapshot.community.watchers_count,
          aggregate: snapshot.community.aggregate,
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
            ...compatibility,
          }
        : null,
    refreshedAt: snapshot?.refreshed_at ?? null,
    staleSince: snapshot?.stale_since ?? null,
  };
}

function urlProject(record, source, vocabularies) {
  const frontends = labeled(record.frontends, vocabularies.frontends);
  const tags = tagged(record.tags, vocabularies.tags);
  const compatibility = presetCompatibility(record, vocabularies);
  const primaryFunction = {
    id: record.primary_function,
    label:
      vocabularies.primaryFunctions.get(record.primary_function)?.label ??
      record.primary_function,
  };
  const license = licenseDisplay(
    source.license_status,
    source.license_spdx_id,
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
    canonicalUrl: source.url,
    catalogedAt: record.cataloged_at,
    catalogCohort: record.catalog_cohort,
    frontends,
    tags,
    searchableText: [
      record.name,
      record.kind,
      record.summary,
      primaryFunction.label,
      ...frontends.map(({ label }) => label),
      ...tags.map(({ label }) => label),
      ...compatibility.modelFamilies.map(({ label }) => label),
      ...compatibility.completionFormats.map(({ label }) => label),
      ...vocabularyAliases(
        record.model_families ?? [],
        vocabularies.modelFamilies,
      ),
      ...vocabularyAliases(record.tags, vocabularies.tags),
    ]
      .join(" ")
      .toLowerCase(),
    activity: emptyActivity(),
    latestReleaseAt: null,
    community: null,
    repositorySizeKb: null,
    license,
    attribution: null,
    preset:
      record.kind === "preset"
        ? {
            version: source.version,
            publishedAt: source.published_at,
            artifactSizeBytes: source.artifact_size_bytes,
            ...compatibility,
          }
        : null,
    refreshedAt: null,
    staleSince: null,
  };
}

function manualProject(record, source, vocabularies) {
  const frontends = labeled(record.frontends, vocabularies.frontends);
  const tags = tagged(record.tags, vocabularies.tags);
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
    canonicalUrl: source.url,
    catalogedAt: record.cataloged_at,
    catalogCohort: record.catalog_cohort,
    frontends,
    tags,
    searchableText: [
      record.name,
      record.kind,
      record.summary,
      primaryFunction.label,
      ...frontends.map(({ label }) => label),
      ...tags.map(({ label }) => label),
      ...vocabularyAliases(record.tags, vocabularies.tags),
    ]
      .join(" ")
      .toLowerCase(),
    activity: emptyActivity(),
    latestReleaseAt: null,
    community: null,
    repositorySizeKb: null,
    license: licenseDisplay("pending", null, "url"),
    attribution: null,
    preset: null,
    refreshedAt: null,
    staleSince: null,
  };
}

export async function buildCatalog(options = {}) {
  const [
    records,
    sources,
    snapshots,
    refreshManifest,
    kitRecords,
    kitSnapshots,
    blockedUsers,
    siteConfig,
    frontendVocabulary,
    primaryFunctionVocabulary,
    tagVocabulary,
    modelFamilyVocabulary,
    completionFormatVocabulary,
  ] = await Promise.all([
    options.records ?? readJsonDirectory("data/registry/projects"),
    options.sources ??
      (options.records
        ? []
        : readOptionalJsonDirectory("data/registry/sources")),
    options.snapshots ??
      Promise.all([
        readJsonDirectory("data/snapshots/github"),
        readOptionalJsonDirectory("data/snapshots/codeberg"),
      ]).then(([github, codeberg]) => [...github, ...codeberg]),
    options.refreshManifest ?? readJson("data/snapshots/github-refresh.json"),
    options.kitRecords ??
      (options.records ? [] : readJsonDirectory("data/registry/kits")),
    options.kitSnapshots ??
      (options.records ? [] : readJsonDirectory("data/snapshots/github/kits")),
    options.blockedUsers ??
      (options.records
        ? { schema_version: 1, blocked: [] }
        : readJson("data/moderation/blocked-github-users.json")),
    options.siteConfig ?? readJson("data/site.json"),
    readJson("data/vocabularies/frontends.json"),
    readJson("data/vocabularies/primary-functions.json"),
    readJson("data/vocabularies/tags.json"),
    readJson("data/vocabularies/model-families.json"),
    readJson("data/vocabularies/completion-formats.json"),
  ]);
  const vocabularies = {
    frontends: entriesById(frontendVocabulary, "frontends"),
    primaryFunctions: entriesById(
      primaryFunctionVocabulary,
      "primary_functions",
    ),
    tags: entriesById(tagVocabulary, "tags"),
    modelFamilies: entriesById(modelFamilyVocabulary, "model_families"),
    completionFormats: entriesById(
      completionFormatVocabulary,
      "completion_formats",
    ),
  };
  const publicTagVocabulary = tagVocabulary.tags.map(
    ({ id, label, facet, description, aliases, applicable_kinds }) => ({
      id,
      label,
      facet,
      description,
      aliases,
      applicable_kinds,
    }),
  );
  const snapshotsBySource = new Map(
    snapshots.map((snapshot) => [snapshot.source_id, snapshot]),
  );
  const generatedAt = options.now ?? refreshManifest.completed_at;
  const generatedAtIso = new Date(generatedAt).toISOString();
  const recordsByProject = new Map(
    records.map((record) => [record.id, record]),
  );
  const registry = indexRegistry({
    projects: records,
    sources,
    snapshots,
  });
  let projects = [];

  for (const record of records) {
    const classificationIssue = classificationError(
      record.kind,
      record.primary_function,
    );
    if (classificationIssue) {
      throw new Error(`${record.id}: classification ${classificationIssue}`);
    }
    const source = registry.sourcesById.get(record.source_id);
    const snapshot = snapshotsBySource.get(record.source_id);
    if (!effectiveListingState({ project: record, source, snapshot }).public) {
      continue;
    }
    if (source.type === "url") {
      if (record.kind === "preset" || record.kind === "frontend") {
        projects.push(urlProject(record, source, vocabularies));
      }
      continue;
    }
    if (source.type === "github-organization") {
      projects.push(manualProject(record, source, vocabularies));
      continue;
    }

    if (!snapshot) {
      projects.push(
        repositoryProject(record, source, null, vocabularies, generatedAtIso),
      );
      continue;
    }
    projects.push(
      repositoryProject(record, source, snapshot, vocabularies, generatedAtIso),
    );
  }

  projects.sort((left, right) => left.id.localeCompare(right.id));
  const publicProjectsBySourceId = new Map();
  for (const project of projects) {
    const sourceId = recordsByProject.get(project.id)?.source_id;
    if (!sourceId) continue;
    publicProjectsBySourceId.set(sourceId, [
      ...(publicProjectsBySourceId.get(sourceId) ?? []),
      { id: project.id, name: project.name },
    ]);
  }
  projects = projects.map((project) => ({
    ...project,
    fork: resolveForkRelationship({
      snapshot:
        snapshotsBySource.get(recordsByProject.get(project.id)?.source_id) ??
        null,
      sourcesByRepositoryKey: registry.sourcesByRepositoryKey,
      publicProjectsBySourceId,
    }),
  }));
  const publicProjectsById = new Map(
    projects.map((project) => [project.id, project]),
  );
  const kitSnapshotsById = new Map(
    kitSnapshots.map((snapshot) => [snapshot.kit_id, snapshot]),
  );
  const blockedIds = new Set(
    (blockedUsers.blocked ?? []).map(({ github_user_id }) => github_user_id),
  );
  const kits = kitRecords
    .filter((kit) => kit.status === "published")
    .map((kit) => {
      const components = kit.project_ids.map((projectId) => {
        const record = recordsByProject.get(projectId);
        const source = registry.sourcesById.get(record?.source_id);
        const snapshot = snapshotsBySource.get(record?.source_id);
        const sourceHealth = snapshot?.source_health;
        const listing =
          record && source
            ? effectiveListingState({
                project: record,
                source,
                snapshot,
              })
            : { public: false, reason: "missing-record" };
        const registryFlagged = !listing.public;
        const availability =
          !record || registryFlagged ? "flagged" : "available";
        const unavailableReason = registryFlagged
          ? listing.reason === "identity-change"
            ? "identity-change"
            : ["deleted", "private"].includes(listing.reason)
              ? "source-unavailable"
              : listing.reason
          : null;
        const publicProject = publicProjectsById.get(projectId) ?? null;

        return {
          projectId,
          name: record?.name ?? projectId,
          kind: record?.kind ?? "extension",
          primaryFunction: record?.primary_function ?? "",
          availability,
          unavailableReason,
          canonicalUrl:
            availability === "available"
              ? (publicProject?.canonicalUrl ?? null)
              : null,
          project: availability === "available" ? publicProject : null,
        };
      });
      const frontends = labeled(
        unique(
          components.flatMap((component) => {
            const record = recordsByProject.get(component.projectId);
            return component.kind === "frontend"
              ? (record?.frontends ?? [])
              : [];
          }),
        ),
        vocabularies.frontends,
      );
      const purposes = labeled(
        unique(
          components
            .filter(
              ({ kind, primaryFunction }) =>
                kind !== "frontend" && primaryFunction,
            )
            .map(({ primaryFunction }) => primaryFunction),
        ),
        vocabularies.primaryFunctions,
      );
      const modelFamilies = labeled(
        unique(
          components.flatMap(
            ({ project }) =>
              project?.preset?.modelFamilies.map(({ id }) => id) ?? [],
          ),
        ),
        vocabularies.modelFamilies,
      );
      const support = kitSnapshotsById.get(kit.id);
      const activeSupporters = (support?.supporters ?? []).filter(
        (supporter) =>
          supporter.active && !blockedIds.has(supporter.github_user_id),
      );
      const votes = activeSupporters.map((supporter) =>
        effectiveVoteAt(supporter.first_reacted_at, kit.published_at),
      );
      const flaggedProjectCount = components.filter(
        ({ availability }) => availability === "flagged",
      ).length;
      const searchableText = [
        kit.title,
        kit.description,
        kit.author.login,
        ...components.map(({ name }) => name),
        ...frontends.map(({ label }) => label),
        ...purposes.map(({ label }) => label),
        ...modelFamilies.map(({ label }) => label),
      ]
        .join(" ")
        .toLowerCase();

      return {
        id: kit.id,
        title: kit.title,
        description: kit.description,
        author: {
          githubUserId: kit.author.github_user_id,
          login: kit.author.login,
        },
        sourceIssueNumber: kit.source_issue_number,
        sourceIssueUrl:
          `https://github.com/${siteConfig.github_repository}` +
          `/issues/${kit.source_issue_number}`,
        publishedAt: kit.published_at,
        updatedAt: kit.updated_at,
        frontends,
        purposes,
        modelFamilies,
        components,
        supporterCount: support ? activeSupporters.length : null,
        trendingScore: support ? trendingScore(votes, generatedAtIso) : null,
        supportRefreshedAt: support?.refreshed_at ?? null,
        supportStale: Boolean(support?.stale_since),
        flaggedProjectCount,
        searchableText,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  const catalog = {
    schemaVersion: 4,
    generatedAt: generatedAtIso,
    tagVocabulary: publicTagVocabulary,
    projects,
    kits,
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
  console.log(
    `Built ${catalog.projects.length} projects and ${catalog.kits.length} Kits`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}

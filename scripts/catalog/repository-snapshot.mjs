export function repositoryFacts(observation, previous = null) {
  const parent = observation.parent
    ? {
        id: observation.parent.id,
        owner: observation.parent.owner,
        name: observation.parent.name,
        url: observation.parent.url,
      }
    : observation.fork
      ? (previous?.parent ?? null)
      : null;
  return {
    id: observation.id,
    owner: observation.owner,
    name: observation.name,
    url: observation.url,
    description: observation.description,
    default_branch: observation.defaultBranch,
    head_sha: observation.headSha,
    head_committed_at: observation.headCommittedAt,
    archived: observation.archived,
    fork: observation.fork ?? false,
    parent,
    created_at: observation.createdAt,
    size_kb: observation.sizeKb,
  };
}

export function provisionalActivity() {
  return {
    latest_source_activity_at: null,
    source_weeks: [],
    provisional_weeks: Array.from({ length: 12 }, () => false),
    latest_release_at: null,
    evidence_status: "provisional",
    baseline_completed_at: null,
    baseline_attempts: 0,
  };
}

export function defaultLicense(previous) {
  return (
    previous ?? {
      status: "missing",
      spdx_id: null,
      source_path: null,
    }
  );
}

export function normalizedLicense(license) {
  return {
    status: license.status,
    spdx_id: license.spdxId,
    source_path: license.sourcePath,
  };
}

export function contributorSnapshotForSuccess(collection, now, provider) {
  const normalized = Array.isArray(collection)
    ? { accounts: collection, method: "repository-contributors" }
    : collection;
  const scan = normalized.scan
    ? {
        next_page: normalized.scan.nextPage,
        cutoff_at: normalized.scan.cutoffAt,
        target_watermark: normalized.scan.targetWatermark,
      }
    : null;
  return {
    accounts: normalized.accounts.map((account) => ({
      ...account,
      provider,
    })),
    method: normalized.method ?? "repository-contributors",
    baseline_completed_at: normalized.baselineCompletedAt ?? null,
    scan,
    refreshed_at: normalized.refreshedAt ?? now,
    stale_since: null,
  };
}

export function contributorSnapshotForFailure(previous, now) {
  if (!previous) return undefined;
  return {
    ...previous,
    stale_since: previous.stale_since ?? now,
  };
}

export function snapshotFromObservation({
  provider,
  sourceId,
  observation,
  previous = null,
  now,
  contributors,
}) {
  const activity = {
    ...(previous?.activity ?? provisionalActivity()),
    latest_release_at: observation.latestReleaseAt,
  };
  const community = observation.community;
  const snapshot = {
    schema_version: 4,
    provider,
    source_id: sourceId,
    repository: repositoryFacts(
      observation.repository,
      previous?.repository ?? null,
    ),
    source_health: "healthy",
    activity,
    community: {
      stars_count: community.starsCount,
      forks_count: community.forksCount,
      watchers_count: community.watchersCount,
      aggregate:
        community.starsCount + community.forksCount + community.watchersCount,
    },
    license: defaultLicense(previous?.license),
    refreshed_at: now,
    stale_since: null,
  };
  if (previous && Object.hasOwn(previous, "activity_scan")) {
    snapshot.activity_scan = previous.activity_scan;
  }
  if (contributors) {
    snapshot.contributors = contributors;
  }
  return snapshot;
}

export function createInitialRepositorySnapshot({
  provider,
  sourceId,
  observation,
  activityInspection,
  contributors,
  now,
}) {
  const snapshot = snapshotFromObservation({
    sourceId,
    provider,
    observation,
    now,
    contributors: contributorSnapshotForSuccess(contributors, now, provider),
  });
  snapshot.activity = {
    ...activityInspection.activity,
    latest_release_at: observation.latestReleaseAt,
    evidence_status: activityInspection.complete
      ? activityInspection.activity.evidence_status
      : "provisional",
  };
  snapshot.license = activityInspection.license
    ? normalizedLicense(activityInspection.license)
    : defaultLicense();
  if (Object.hasOwn(activityInspection, "scan")) {
    snapshot.activity_scan = activityInspection.scan;
  }
  return snapshot;
}

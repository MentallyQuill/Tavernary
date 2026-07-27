import { calculateCommunity } from "../../src/lib/github/repository-metrics.ts";

export function repositoryFacts(observation) {
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
    fork: observation.fork,
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

export function contributorSnapshotForSuccess(accounts, now) {
  return {
    accounts,
    refreshed_at: now,
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
  projectId,
  observation,
  previous = null,
  now,
  contributors,
}) {
  const activity = {
    ...(previous?.activity ?? provisionalActivity()),
    latest_release_at: observation.latestReleaseAt,
  };
  const snapshot = {
    schema_version: 2,
    project_id: projectId,
    repository: repositoryFacts(observation.repository),
    source_health: "healthy",
    activity,
    community: calculateCommunity(observation.community),
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
  projectId,
  observation,
  activityInspection,
  contributors,
  now,
}) {
  const snapshot = snapshotFromObservation({
    projectId,
    observation,
    now,
    contributors: contributorSnapshotForSuccess(contributors, now),
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

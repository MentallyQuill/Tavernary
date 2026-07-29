export function backfillRepositoryIdentities(records, snapshots, options = {}) {
  const snapshotsById = new Map(
    snapshots.map((snapshot) => [snapshot.source_id, snapshot]),
  );
  const updated = [];
  const conflicts = [];
  let skipped = 0;

  for (const record of records) {
    if (options.sourceIds && !options.sourceIds.has(record.id)) {
      skipped += 1;
      continue;
    }
    if (record.type !== "github") {
      skipped += 1;
      continue;
    }

    const snapshot = snapshotsById.get(record.id);
    if (!snapshot || snapshot.source_health !== "healthy") {
      skipped += 1;
      continue;
    }

    const expectedRepository = record.repository.toLowerCase();
    const receivedRepository =
      `${snapshot.repository.owner}/${snapshot.repository.name}`.toLowerCase();
    if (expectedRepository !== receivedRepository) {
      conflicts.push({
        id: record.id,
        reason: "repository-name-mismatch",
        expected: record.repository,
        received: `${snapshot.repository.owner}/${snapshot.repository.name}`,
      });
      continue;
    }

    const repositoryId = snapshot.repository.id;
    if (record.repository_id === null) {
      updated.push({
        ...record,
        repository_id: repositoryId,
      });
    } else if (record.repository_id !== repositoryId) {
      conflicts.push({
        id: record.id,
        reason: "repository-id-mismatch",
        expected: record.repository_id,
        received: repositoryId,
      });
    } else {
      skipped += 1;
    }
  }

  return {
    updated,
    conflicts,
    summary: {
      changed: updated.length,
      skipped,
      conflicts: conflicts.length,
    },
  };
}

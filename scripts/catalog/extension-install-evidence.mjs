const safeFolderName = /^[A-Za-z0-9._-]+$/u;

export function deriveExtensionInstallEvidence(input) {
  const base = {
    schema_version: 1,
    source_id: input.sourceId,
    head_sha: input.repository.headSha,
    observed_at: input.observedAt,
  };

  if (input.manifestPath !== "manifest.json") {
    return { ...base, status: "unavailable", reason: "manifest-not-at-root" };
  }

  const manifest = input.manifest;
  const hasEntry =
    (typeof manifest?.js === "string" && manifest.js.trim().length > 0) ||
    (typeof manifest?.css === "string" && manifest.css.trim().length > 0);
  if (
    !manifest ||
    typeof manifest.display_name !== "string" ||
    manifest.display_name.trim().length === 0 ||
    !Number.isFinite(manifest.loading_order) ||
    !hasEntry
  ) {
    return { ...base, status: "unavailable", reason: "invalid-manifest" };
  }

  const folderName = repositoryFolderName(input.repository.repositoryUrl);
  if (!folderName) {
    return { ...base, status: "unavailable", reason: "invalid-repository" };
  }

  return {
    ...base,
    status: "verified",
    manifest_path: "manifest.json",
    folder_name: folderName,
    manifest: {
      display_name: manifest.display_name,
      key: typeof manifest.key === "string" ? manifest.key : null,
      minimum_client_version:
        typeof manifest.minimum_client_version === "string"
          ? manifest.minimum_client_version
          : null,
    },
  };
}

export async function refreshExtensionInstallEvidence(input) {
  const evidenceBySource = new Map(
    (input.previousEvidence ?? []).map((entry) => [entry.source_id, entry]),
  );
  const sourceById = new Map(
    input.sources.map((source) => [source.id, source]),
  );
  const snapshotById = new Map(
    input.snapshots.map((snapshot) => [snapshot.source_id, snapshot]),
  );
  const eligibleSourceIds = new Set(
    input.projects
      .filter(
        (project) =>
          project.kind === "extension" &&
          project.listing_status === "active" &&
          Array.isArray(project.frontends) &&
          project.frontends.includes("sillytavern"),
      )
      .map((project) => project.source_id),
  );
  const requestedSourceIds = input.sourceIds ? new Set(input.sourceIds) : null;
  const changedEvidence = [];

  for (const sourceId of [...eligibleSourceIds].sort()) {
    if (requestedSourceIds && !requestedSourceIds.has(sourceId)) continue;
    const source = sourceById.get(sourceId);
    const snapshot = snapshotById.get(sourceId);
    if (
      !source ||
      source.status !== "active" ||
      (source.type !== "github" && source.type !== "codeberg") ||
      !snapshot?.repository?.head_sha
    ) {
      continue;
    }

    const previous = evidenceBySource.get(sourceId);
    const currentFolderName = repositoryFolderName(snapshot.repository.url);
    if (
      previous?.head_sha === snapshot.repository.head_sha &&
      previous.reason !== "fetch-failed" &&
      (previous.status !== "verified" ||
        previous.folder_name === currentFolderName)
    ) {
      continue;
    }
    if (snapshot.source_health !== "healthy") {
      continue;
    }

    const provider = input.providers[source.type];
    if (!provider?.readRootFile) {
      throw new Error(`Missing ${source.type} provider for install evidence.`);
    }

    const repository = {
      provider: source.type,
      repositoryUrl: snapshot.repository.url,
      defaultBranch: snapshot.repository.default_branch,
      headSha: snapshot.repository.head_sha,
    };
    let next;
    try {
      const file = await provider.readRootFile({
        repository: source.repository,
        ref: snapshot.repository.head_sha,
        path: "manifest.json",
      });
      if (!file) {
        next = unavailableEvidence({
          sourceId,
          headSha: snapshot.repository.head_sha,
          observedAt: input.observedAt,
          reason: "manifest-not-found",
        });
      } else {
        let manifest = null;
        try {
          manifest = JSON.parse(file.content);
        } catch {
          // The pure derivation records malformed JSON as an invalid manifest.
        }
        next = deriveExtensionInstallEvidence({
          sourceId,
          repository,
          manifestPath: file.path,
          manifest,
          observedAt: input.observedAt,
        });
      }
    } catch {
      next = unavailableEvidence({
        sourceId,
        headSha: snapshot.repository.head_sha,
        observedAt: input.observedAt,
        reason: "fetch-failed",
      });
    }

    evidenceBySource.set(sourceId, next);
    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      changedEvidence.push(next);
    }
  }

  return {
    evidence: [...evidenceBySource.values()].sort((left, right) =>
      left.source_id.localeCompare(right.source_id),
    ),
    changedEvidence,
  };
}

function unavailableEvidence({ sourceId, headSha, observedAt, reason }) {
  return {
    schema_version: 1,
    source_id: sourceId,
    head_sha: headSha,
    observed_at: observedAt,
    status: "unavailable",
    reason,
  };
}

function repositoryFolderName(repositoryUrl) {
  try {
    const url = new URL(repositoryUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password || url.search || url.hash) return null;
    const encodedName = url.pathname
      .replace(/\/+$/u, "")
      .split("/")
      .filter(Boolean)
      .at(-1);
    if (!encodedName) return null;
    const name = decodeURIComponent(encodedName).replace(/\.git$/iu, "");
    return safeFolderName.test(name) && name !== "." && name !== ".."
      ? name
      : null;
  } catch {
    return null;
  }
}

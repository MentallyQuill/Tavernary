import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { format } from "prettier";
import { validateAutomationOperation } from "./operation.mjs";
import { CATALOG_POLICY_VERSION } from "../../src/features/catalog/catalog-policy.mjs";
import { effectiveListingState } from "../../src/features/catalog/listing-state.mjs";
import {
  loadReadmeSource,
  createSnapshotValidator,
} from "../catalog/readme-source.mjs";
import { tagVocabularyHash } from "../catalog/tag-vocabulary.mjs";
import {
  enrichRecord,
  applyEnrichmentOutput,
} from "../catalog/enrich-readmes.mjs";
import { createEnrichmentProvider } from "../catalog/enrichment-provider.mjs";
import { modelProviderOptionsFromEnvironment } from "../catalog/model-provider-configuration.mjs";
import {
  createMetadataCache,
  metadataCacheMatches,
  normalizeMetadataContent,
  validateMetadataCache,
} from "./metadata-refresh.mjs";

const unavailable = (code = "source-unavailable") =>
  Object.assign(new Error("Verified metadata source is unavailable."), {
    code,
  });
export function metadataOperationRecords({ state, operation }) {
  validateAutomationOperation(operation);
  if (
    !["metadata", "advisory"].includes(operation.identity.kind) ||
    !state.operations.some((value) => value.key === operation.key)
  )
    throw unavailable("input-superseded");
  const [, sourceId, projectId] = operation.identity.subject.split(":");
  const source = state.local.sources.find((value) => value.id === sourceId);
  const project = state.local.projects.find(
    (value) => value.id === projectId && value.source_id === sourceId,
  );
  const snapshot = state.local.snapshots.find(
    (value) => value.source_id === sourceId,
  );
  if (
    !source ||
    !project ||
    !["github", "codeberg"].includes(source.type) ||
    source.status !== "active" ||
    source.refresh_policy !== "automatic" ||
    !Number.isSafeInteger(source.repository_id) ||
    source.repository_id < 1 ||
    snapshot?.repository?.id !== source.repository_id ||
    !/^[a-f0-9]{40}$/u.test(snapshot?.repository?.head_sha ?? "") ||
    !effectiveListingState({ project, source, snapshot }).public
  )
    throw unavailable("authorization-lost");
  return { project, source, snapshot };
}

export async function observeMetadataSource({
  state,
  operation,
  fetchImpl = fetch,
}) {
  const { project, source, snapshot } = metadataOperationRecords({
    state,
    operation,
  });
  return observeProjectMetadataSource({
    state,
    project,
    source,
    snapshot,
    fetchImpl,
    policyVersion: operation.identity.policyVersion,
  });
}
export async function observeProjectMetadataSource({
  state,
  project,
  source,
  snapshot,
  fetchImpl = fetch,
  policyVersion = CATALOG_POLICY_VERSION,
}) {
  const vocabulary = JSON.parse(
    await readFile(resolve(state.root, "data/vocabularies/tags.json"), "utf8"),
  );
  const schema = JSON.parse(
    await readFile(
      resolve(state.root, "data/schemas/repository-snapshot.schema.json"),
      "utf8",
    ),
  );
  const [owner, name] = source.repository.split("/");
  if (!owner || !name || source.repository.split("/").length !== 2)
    throw unavailable("authorization-lost");
  const base =
    source.type === "github"
      ? "https://api.github.com"
      : "https://codeberg.org/api/v1";
  const repositoryPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  const token =
    source.type === "github"
      ? process.env.GITHUB_TOKEN || process.env.GH_TOKEN
      : process.env.CODEBERG_TOKEN;
  const request = async (path, allowMissing = false) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    let reader;
    try {
      const response = await fetchImpl(`${base}${path}`, {
        redirect: "error",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "Tavernary-metadata-preparation",
          ...(token
            ? {
                Authorization: `${source.type === "github" ? "Bearer" : "token"} ${token}`,
              }
            : {}),
        },
      });
      if (response.status === 404 && allowMissing) return null;
      if (!response.ok)
        throw Object.assign(unavailable(), { status: response.status });
      if (Number(response.headers.get("content-length")) > 2097152)
        throw unavailable("source-invalid");
      reader = response.body?.getReader();
      if (!reader) throw unavailable("source-invalid");
      const chunks = [];
      let bytes = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 2097152) throw unavailable("source-invalid");
        chunks.push(value);
      }
      return JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
      );
    } catch (error) {
      if (error?.name === "AbortError") throw unavailable("provider-timeout");
      if (error?.status || error?.code === "source-invalid") throw error;
      throw unavailable("provider-network-error");
    } finally {
      clearTimeout(timeout);
      if (reader) await reader.cancel().catch(() => {});
    }
  };
  const repository = await request(repositoryPath);
  if (
    repository?.id !== source.repository_id ||
    repository.private === true ||
    String(
      repository.owner?.login ?? repository.owner?.username ?? "",
    ).toLowerCase() !== owner.toLowerCase() ||
    String(repository.name ?? "").toLowerCase() !== name.toLowerCase()
  )
    throw unavailable("authorization-lost");
  const loaded = await loadReadmeSource(source, snapshot, {
    validateSnapshot: createSnapshotValidator(schema),
    providers: {
      [source.type]: {
        readRootReadme: async () => {
          const result = await request(
            `${repositoryPath}/readme?ref=${snapshot.repository.head_sha}`,
            true,
          );
          if (result?.content && Buffer.byteLength(result.content) > 1500000)
            throw unavailable("source-invalid");
          return result;
        },
      },
    },
  });
  if (!["ready", "fallback"].includes(loaded.status))
    throw unavailable(loaded.reasonCode);
  const loadedSource = {
    ...loaded,
    sourceIdentity: `${source.type}:${source.repository.toLowerCase()}`,
  };
  const normalizedContent = normalizeMetadataContent({
    readme: loaded.readmeText,
    description: loaded.repositoryDescription,
  });
  return {
    source: loadedSource,
    evidence: {
      sourceId: source.id,
      sourceIdentity: `${source.type}:${source.repository_id}`,
      provider: source.type,
      headSha: snapshot.repository.head_sha,
      normalizedContent,
      status: "ready",
      public: true,
      observedAt: new Date(state.nowMs).toISOString(),
      policyVersion,
      vocabularyHash: tagVocabularyHash(vocabulary),
    },
  };
}

export function metadataObservationIsCached({ state, operation, observation }) {
  const { project } = metadataOperationRecords({ state, operation });
  return (
    project.metadata_status === "curated" &&
    (state.local.metadataState ?? []).some((cache) =>
      metadataCacheMatches({
        cache,
        record: project,
        evidence: observation.evidence,
      }),
    )
  );
}
export function validateMetadataPreparedFiles({
  state,
  operation,
  observation,
  files,
  validateProject,
}) {
  try {
    const { project, source, snapshot } = metadataOperationRecords({
      state,
      operation,
    });
    const projectPath = `data/registry/projects/${project.id}.json`;
    const cachePath = `data/maintenance/automation/metadata/${operation.key}.json`;
    if (
      !Array.isArray(files) ||
      files.length > 2 ||
      files.some((file) => ![projectPath, cachePath].includes(file.path))
    )
      return false;
    const cacheFile = files.find((file) => file.path === cachePath);
    if (!cacheFile) return false;
    const proposed = files.find((file) => file.path === projectPath);
    const updated = proposed ? JSON.parse(proposed.content) : project;
    if (!validateProject(updated)) return false;
    const cache = validateMetadataCache(JSON.parse(cacheFile.content));
    if (Date.parse(cache.observedAt) > state.nowMs + 300000) return false;
    const expected = createMetadataCache({
      operation,
      record: updated,
      sourceIdentity: `${source.type}:${source.repository_id}`,
      headSha: snapshot.repository.head_sha,
      normalizedContent: observation.evidence.normalizedContent,
      vocabularyHash: observation.evidence.vocabularyHash,
      nowMs: Date.parse(cache.observedAt),
    });
    return Object.keys(expected).every(
      (key) => JSON.stringify(cache[key]) === JSON.stringify(expected[key]),
    );
  } catch {
    return false;
  }
}

export async function acquirePreparedMetadataData({
  state,
  operation,
  options = {},
}) {
  if (operation.identity.kind !== "metadata")
    throw unavailable("input-superseded");
  const { project, source, snapshot } = metadataOperationRecords({
    state,
    operation,
  });
  const observation = await (options.observe ?? observeMetadataSource)({
    state,
    operation,
  });
  const cached = metadataObservationIsCached({ state, operation, observation });
  let updated = project;
  if (!cached) {
    if (observation.source.status === "fallback")
      throw unavailable("source-unavailable");
    let provider = options.provider;
    if (!provider) {
      const budgetGuard = await options.budgetGuard?.();
      try {
        provider = createEnrichmentProvider({
          ...modelProviderOptionsFromEnvironment(options.env),
          requireBudget: true,
          budgetGuard,
        });
      } catch {
        throw unavailable("provider-configuration-invalid");
      }
    }
    const vocabularies = JSON.parse(
      await readFile(
        resolve(state.root, "data/vocabularies/tags.json"),
        "utf8",
      ),
    );
    const output = await enrichRecord(project, source, snapshot, provider, {
      force: true,
      maxProviderAttempts: 3,
      vocabularies,
      policyVersion: operation.identity.policyVersion,
      loadSource: async () => observation.source,
      sleep: options.sleep,
    });
    if (!output) throw unavailable("input-superseded");
    updated = applyEnrichmentOutput(project, output, vocabularies);
  }
  const cache = createMetadataCache({
    operation,
    record: updated,
    sourceIdentity: observation.evidence.sourceIdentity,
    headSha: observation.evidence.headSha,
    normalizedContent: observation.evidence.normalizedContent,
    vocabularyHash: observation.evidence.vocabularyHash,
    nowMs: state.nowMs,
  });
  const outputs = {
    [`data/maintenance/automation/metadata/${operation.key}.json`]:
      await format(JSON.stringify(cache), { parser: "json" }),
  };
  if (!cached)
    outputs[`data/registry/projects/${project.id}.json`] = await format(
      JSON.stringify(updated),
      { parser: "json" },
    );
  return outputs;
}

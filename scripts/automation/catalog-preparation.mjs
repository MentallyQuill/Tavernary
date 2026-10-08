import { readCanonicalFiles } from "./canonical-files.mjs";
import { format } from "prettier";
import { assertTrustedPreparedProducer } from "./prepared-result.mjs";
import {
  capturePreparedOperation,
  emitPreparedOperation,
} from "./preparation.mjs";
import { createPreparedPublicationContext } from "./publication-context.mjs";
import { runRepositoryRefresh } from "../catalog/refresh-repositories.mjs";
import { acquirePreparedKitData } from "./kit-preparation.mjs";
import { acquirePreparedReportData } from "./report-preparation.mjs";
import { acquirePreparedMetadataData } from "./metadata-preparation.mjs";
import { acquirePreparedAdvisoryData } from "./advisory-preparation.mjs";
import {
  selectRefreshCompanionData,
  REFRESH_COMPANION_SOURCE_ID,
} from "./catalog-operations.mjs";
import { buildRefreshManifest } from "../catalog/github-refresh-manifest.mjs";
import { refreshKitReactions } from "../kits/refresh-reactions.mjs";
import { executeGh } from "../submissions/kit-submission-reconciliation.mjs";

export function assertCatalogPreparationContext({ state, operation, env }) {
  const workflow = env.GITHUB_WORKFLOW_REF?.slice(
    `${state.repository}/`.length,
  ).split("@")[0];
  if (
    env.GITHUB_REF !== "refs/heads/main" ||
    env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
    env.GITHUB_REPOSITORY !== state.repository ||
    env.GITHUB_SHA !== state.local.revision ||
    Number(env.GITHUB_ACTOR_ID) !== state.publisherActorId ||
    Number(env.TAVERNARY_PUBLISHER_BOT_ID) !== state.publisherActorId ||
    env.GITHUB_WORKFLOW_REF !==
      `${state.repository}/${workflow}@refs/heads/main`
  )
    throw new Error("Catalog preparation context is untrusted.");
  const producer = {
    workflow,
    runId: Number(env.GITHUB_RUN_ID),
    sourceSha: env.GITHUB_SHA,
  };
  assertTrustedPreparedProducer({
    kind: operation.identity.kind,
    repository: state.repository,
    publisherActorId: state.publisherActorId,
    run: {
      id: producer.runId,
      path: workflow,
      actor: { id: Number(env.GITHUB_ACTOR_ID), type: "Bot" },
      event: "workflow_dispatch",
      head_branch: "main",
      head_sha: producer.sourceSha,
      head_repository: { full_name: state.repository },
      status: "completed",
      conclusion: "success",
    },
  });
  return producer;
}
export async function acquireRefreshData({
  state,
  operation,
  mode = "project",
  refresh = runRepositoryRefresh,
  fetchPage = async ({ kit, page, perPage }) => {
    if (page > 10)
      throw new Error("Kit reaction inventory exceeds its page bound.");
    const text = await executeGh([
      "api",
      `repos/${state.repository}/issues/${kit.source_issue_number}/reactions?per_page=${perPage}&page=${page}`,
    ]);
    if (Buffer.byteLength(text) > 4 * 1024 * 1024)
      throw new Error("Kit reaction page exceeds its byte bound.");
    const values = JSON.parse(text);
    if (!Array.isArray(values) || values.length > perPage)
      throw new Error("Kit reaction page is invalid.");
    return values;
  },
}) {
  if (
    operation.identity.kind !== "refresh" ||
    !["project", "forensic"].includes(mode)
  )
    throw new Error("Catalog acquisition is unsupported.");
  if (operation.identity.subject === `source:${REFRESH_COMPANION_SOURCE_ID}`) {
    const companions = selectRefreshCompanionData(state.local);
    const now = new Date(state.nowMs).toISOString();
    // This observation advances the display clock without claiming any repository fetch.
    const manifest = buildRefreshManifest({
      mode: "incremental",
      startedAt: now,
      completedAt: now,
      outcomes: [],
      snapshots: state.local.snapshots,
    });
    const outputs = {
      "data/snapshots/github-refresh.json": await format(
        JSON.stringify(manifest),
        { parser: "json" },
      ),
    };
    const snapshots = await refreshKitReactions({
      kits: companions.kits,
      snapshots: state.local.kitSnapshots ?? [],
      blockedUsers: state.local.blockedUsers,
      fetchPage,
      now,
    });
    const blocked = new Set(
      state.local.blockedUsers.blocked.map((user) => user.github_user_id),
    );
    const published = new Set(
      companions.kits
        .filter((kit) => kit.status === "published")
        .map((kit) => kit.id),
    );
    for (const snapshot of snapshots) {
      snapshot.supporters = snapshot.supporters.map((user) => ({
        ...user,
        active:
          user.active &&
          published.has(snapshot.kit_id) &&
          !blocked.has(user.github_user_id),
      }));
      outputs[`data/snapshots/github/kits/${snapshot.kit_id}.json`] =
        await format(JSON.stringify(snapshot), { parser: "json" });
    }
    return outputs;
  }
  const result = await refresh({
    write: false,
    mode,
    sourceId: operation.identity.subject.slice(7),
    records: state.local.sources,
    projects: state.local.projects,
    snapshots: state.local.snapshots,
    installEvidence: state.local.installEvidence,
    previousManifest: state.local.refreshManifest,
    startedAt: state.nowMs,
  });
  if (result.manifest.counts.failed)
    throw Object.assign(new Error("Source observation failed."), {
      ...(result.manifest.api.graphql_remaining === 0 ? { status: 429 } : {}),
    });
  const outputs = {};
  for (const snapshot of result.changedSnapshots)
    outputs[`data/snapshots/${snapshot.provider}/${snapshot.source_id}.json`] =
      await format(JSON.stringify(snapshot), { parser: "json" });
  const sourceId = operation.identity.subject.slice(7);
  const observed = result.manifest.source_timings.find(
    (entry) =>
      entry.source_id === sourceId &&
      !["failed", "unavailable", "identity-change"].includes(entry.outcome),
  );
  const snapshot = result.snapshots?.find(
    (entry) => entry.source_id === sourceId,
  );
  if (
    observed &&
    snapshot?.source_health === "healthy" &&
    snapshot.stale_since === null
  ) {
    // A successful comparison is durable progress even when repository facts did not change.
    outputs[`data/snapshots/${snapshot.provider}/${sourceId}.json`] =
      await format(
        JSON.stringify({
          ...snapshot,
          refreshed_at: result.manifest.completed_at,
        }),
        { parser: "json" },
      );
  }
  for (const evidence of result.changedInstallEvidence)
    outputs[`data/snapshots/install/${evidence.source_id}.json`] = await format(
      JSON.stringify(evidence),
      { parser: "json" },
    );
  return outputs;
}
export async function prepareCatalogOperation({
  state,
  operation,
  producer,
  acquire = acquireCatalogData,
  context = createPreparedPublicationContext,
}) {
  if (!state.operations.some((current) => current.key === operation.key))
    throw Object.assign(new Error("Preparation operation is superseded."), {
      code: "input-superseded",
    });
  const currentState = await context({ state, operation, preparation: true });
  const captured = capturePreparedOperation({
    operation,
    currentState,
    producer,
    publisherActorId: state.publisherActorId,
  });
  const outputs = await acquire({ state, operation });
  if (
    !outputs ||
    typeof outputs !== "object" ||
    Array.isArray(outputs) ||
    Object.keys(outputs).some(
      (path) =>
        !captured.allowedPaths.includes(path) ||
        typeof outputs[path] !== "string",
    )
  )
    throw new Error(
      "Catalog acquisition contains an unrelated or executable path.",
    );
  const baseline = readCanonicalFiles({
    root: state.root,
    revision: state.local.revision,
    paths: captured.allowedPaths.filter(
      (path) => !Object.hasOwn(outputs, path),
    ),
  });
  return emitPreparedOperation({
    captured,
    currentState,
    read: async (path) => {
      if (Object.hasOwn(outputs, path))
        return { type: "file", content: outputs[path] };
      return baseline[path]
        ? {
            type: "file",
            content: new TextDecoder("utf-8", { fatal: true }).decode(
              baseline[path],
            ),
          }
        : null;
    },
  });
}
export async function acquireCatalogData(input) {
  if (input.operation.identity.kind === "metadata")
    return acquirePreparedMetadataData(input);
  if (input.operation.identity.kind === "advisory")
    return acquirePreparedAdvisoryData(input);
  if (input.operation.identity.kind === "report-import")
    return acquirePreparedReportData(input);
  if (input.operation.identity.kind === "refresh")
    return acquireRefreshData(input);
  if (
    ["kit", "withdrawal"].includes(input.operation.identity.kind) &&
    (!input.mode || input.mode === "project")
  )
    return acquirePreparedKitData(input);
  throw new Error("Catalog acquisition kind is unsupported.");
}

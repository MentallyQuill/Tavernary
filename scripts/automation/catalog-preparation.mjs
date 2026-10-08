import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { format } from "prettier";
import { assertTrustedPreparedProducer } from "./prepared-result.mjs";
import {
  capturePreparedOperation,
  emitPreparedOperation,
} from "./preparation.mjs";
import { createPreparedPublicationContext } from "./publication-context.mjs";
import { runRepositoryRefresh } from "../catalog/refresh-repositories.mjs";

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
}) {
  if (
    operation.identity.kind !== "refresh" ||
    !["project", "forensic"].includes(mode)
  )
    throw new Error("Catalog acquisition is unsupported.");
  const result = await runRepositoryRefresh({
    write: false,
    mode,
    sourceId: operation.identity.subject.slice(7),
    records: state.local.sources,
    projects: state.local.projects,
    snapshots: state.local.snapshots,
    installEvidence: state.local.installEvidence,
    previousManifest: state.local.refreshManifest,
  });
  if (result.manifest.counts.failed)
    throw Object.assign(new Error("Source observation failed."), {
      ...(result.manifest.api.graphql_remaining === 0 ? { status: 429 } : {}),
    });
  const outputs = {};
  for (const snapshot of result.changedSnapshots)
    outputs[`data/snapshots/${snapshot.provider}/${snapshot.source_id}.json`] =
      await format(JSON.stringify(snapshot), { parser: "json" });
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
  acquire = acquireRefreshData,
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
  return emitPreparedOperation({
    captured,
    currentState,
    read: async (path) => {
      if (Object.hasOwn(outputs, path))
        return { type: "file", content: outputs[path] };
      try {
        const file = resolve(state.root, path);
        if (!(await lstat(file)).isFile())
          return { type: "symlink", content: "" };
        return {
          type: "file",
          content: new TextDecoder("utf-8", { fatal: true }).decode(
            await readFile(file),
          ),
        };
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },
  });
}

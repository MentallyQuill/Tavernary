import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { expect, test, vi } from "vitest";
import {
  catalogInventoryFixture,
  preparedResultFixture,
} from "../helpers/automation-fixtures";
import {
  createEnrichmentRunState,
  applyAttemptResults,
  approveCanaryDeployment,
  recordCheckpointPublication,
} from "../../scripts/catalog/enrichment-run-state.mjs";
import { createEnrichmentReport } from "../../scripts/catalog/enrichment-report.mjs";
import {
  discoverEnrichmentOperations,
  hasConfirmedEnrichmentCanary,
} from "../../scripts/automation/enrichment-preparation.mjs";
import { createCanonicalPublicationRecord } from "../../scripts/automation/publication-record.mjs";
import { readCanonicalPublicationEvidence } from "../../scripts/automation/publication-evidence.mjs";
import { operationKey } from "../../scripts/automation/operation.mjs";
import { runPublicationWriterFinalization } from "../../scripts/automation/writer-runtime.mjs";
import { assessInventoryHealth } from "../../scripts/automation/health.mjs";
import { formatJson } from "../../scripts/catalog/json-format.mjs";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
import type { AutomationReceipt } from "../../scripts/automation/receipts.mjs";
import type { commitCanonicalData } from "../../scripts/automation/canonical-data.mjs";

const now = "2026-10-08T18:00:00.000Z",
  model = "fixture-model";
async function fixture() {
  const prefix = join(tmpdir(), "tavernary-enrichment-finalization-");
  const root = await mkdtemp(prefix);
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const base = catalogInventoryFixture();
  const ids = ["a", "b", "c", "d", "e"];
  const projects = ids.map((id) => ({
    ...base.catalog.projects[0],
    id,
    source_id: `github-${id}`,
    summary: "Canonical model summary.",
    metadata_policy: {
      summary: { mode: "automatic" },
      tags: { mode: "manual", note: "Owner tags." },
    },
  }));
  const sources = ids.map((id) => ({
    ...base.catalog.sources[0],
    id: `github-${id}`,
    repository: `Owner/${id}`,
  }));
  const full = createEnrichmentReport(
    createEnrichmentRunState({
      mode: "full",
      runId: "preserved-legacy-full",
      manifest: ids,
      batchSize: 30,
      concurrency: 6,
      model,
      now,
      selectionMode: "all-automatic",
    }),
  );
  const runningFull = createEnrichmentReport(
    applyAttemptResults(
      full,
      [{ id: "a", phase: "primary", outcome: "enriched" }],
      now,
      { checkpointLimit: 1 },
    ),
  );
  let canary = createEnrichmentRunState({
    mode: "canary",
    runId: "owner-enrichment-987",
    manifest: ids,
    batchSize: 30,
    concurrency: 2,
    model,
    now,
    selectionMode: "all-automatic",
  });
  const attempt = (id: string) => ({
    id,
    phase: "primary" as const,
    outcome: "enriched" as const,
    sourceId: `github-${id}`,
    sourceKind: "description" as const,
    sourceIdentity: `github:owner/${id}`,
    requestedFields: ["summary"] as const,
    repositoryId: 42,
    provider: { requestedModel: model, returnedModel: model, latencyMs: 1 },
  });
  canary = applyAttemptResults(canary, ids.slice(0, 4).map(attempt), now, {
    checkpointLimit: 4,
  });
  const state: AutomationInventoryState = {
    root,
    repository: "MentallyQuill/Tavernary",
    publisherActorId: 900,
    nowMs: Date.parse(now),
    remote: { mainHeadSha: "a".repeat(40), issues: [], pulls: [], runs: [] },
    receipts: [],
    operations: [],
    local: {
      revision: "a".repeat(40),
      projects,
      sources,
      snapshots: [],
      vocabularyHash: "c".repeat(64),
      enrichmentCanary: createEnrichmentReport(canary),
      enrichmentFull: runningFull,
      publications: [],
      publicationFileDigests: {},
      confirmedRevisions: [],
    },
  };
  const admitted = discoverEnrichmentOperations(state)[0];
  const checkpoint = createEnrichmentReport(
    applyAttemptResults(canary, [attempt("e")], now, { checkpointLimit: 1 }),
  );
  const path = "data/reports/enrichment-canary.json",
    content = await formatJson(checkpoint);
  const result = preparedResultFixture();
  Object.assign(result, {
    kind: "enrichment",
    operationKey: admitted.key,
    inputDigest: admitted.identity.inputDigest,
    policyVersion: admitted.identity.policyVersion,
    producer: {
      workflow: ".github/workflows/enrich-catalog.yml",
      runId: 99,
      sourceSha: "a".repeat(40),
    },
    files: [
      {
        path,
        type: "file",
        content,
        bytes: Buffer.byteLength(content),
        sha256: createHash("sha256").update(content).digest("hex"),
        baseDigest: null,
      },
    ],
  });
  const record = createCanonicalPublicationRecord({
    result,
    operation: admitted,
  });
  git("init", "--initial-branch=main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.test");
  git("config", "core.autocrlf", "false");
  const save = async (path: string, content: string) => {
    await mkdir(join(root, dirname(path)), { recursive: true });
    await writeFile(join(root, path), content);
  };
  for (const project of projects)
    await save(
      `data/registry/projects/${project.id}.json`,
      await formatJson(project),
    );
  for (const source of sources)
    await save(
      `data/registry/sources/${source.id}.json`,
      await formatJson(source),
    );
  await save(path, content);
  await save(
    `data/maintenance/automation/publications/${admitted.key}.json`,
    `${JSON.stringify(record, null, 2)}\n`,
  );
  git("add", "data");
  git("commit", "-m", "Native terminal checkpoint");
  const revision = git("rev-parse", "HEAD");
  const proof = await readCanonicalPublicationEvidence({
    root,
    revision,
    records: [record],
  });
  state.local.publications = proof.publications;
  state.local.publicationFileDigests = proof.fileDigests;
  state.local.revision = revision;
  state.remote.mainHeadSha = revision;
  state.local.enrichmentCanary = checkpoint;
  const operation = {
    ...admitted,
    stage: "deployment-confirmed" as const,
    expectedSha: revision,
  };
  state.operations = [operation];
  const deployment = {
    sourceSha: revision,
    workflowRunId: 100,
    status: "confirmed",
    bundleDigest: "b".repeat(64),
    confirmation: {
      sourceSha: revision,
      catalogDigest: "c".repeat(64),
      targetDigest: "d".repeat(64),
      buildDigest: "b".repeat(64),
      essentialSmokePassed: true,
    },
  };
  state.local.deployments = [deployment];
  state.local.confirmedRevisions = [revision];
  const commit = vi.fn(
    async (input: Omit<Parameters<typeof commitCanonicalData>[0], "gh">) => {
      expect(input.expectedMainSha).toBe(state.local.revision);
      for (const file of input.files) {
        await save(file.path, file.content);
        if (file.path === path)
          state.local.enrichmentCanary = JSON.parse(file.content);
        else if (file.path.endsWith("enrichment-report.json"))
          state.local.enrichmentFull = JSON.parse(file.content);
      }
      git("add", "data");
      git("commit", "-m", input.message);
      const sha = git("rev-parse", "HEAD");
      state.local.revision = sha;
      state.remote.mainHeadSha = sha;
      return { sha };
    },
  );
  const persist = vi.fn(async (receipt: AutomationReceipt) => {
    state.receipts = [receipt];
    state.operations = [receipt.operation];
  });
  const env = {
    GITHUB_REPOSITORY: state.repository,
    GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_ACTOR_ID: "2625904",
    GITHUB_WORKFLOW_REF: `${state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
    TAVERNARY_PUBLISHER_BOT_ID: "900",
  };
  const input = {
    operationKey: operation.key,
    env,
    load: async () => state,
    commit,
    persist,
    gh: vi.fn(async () => {
      throw new Error("No extra provider or dispatch required");
    }),
  };
  const cleanup = async () => {
    if (!root.startsWith(prefix)) throw new Error("Unsafe fixture cleanup");
    await rm(root, { recursive: true, force: true });
  };
  return {
    state,
    operation,
    checkpoint,
    full: runningFull,
    deployment,
    revision,
    input,
    commit,
    persist,
    git,
    save,
    cleanup,
  };
}

test("the native writer approves the actually deployed canary and resumes the frozen full report exactly once", async () => {
  const f = await fixture();
  try {
    expect(await runPublicationWriterFinalization(f.input)).toEqual({
      status: "finalized",
    });
    const canary = f.state.local.enrichmentCanary as typeof f.checkpoint;
    const full = f.state.local.enrichmentFull as typeof f.full;
    expect(canary).toEqual(
      createEnrichmentReport(
        approveCanaryDeployment(
          recordCheckpointPublication(f.checkpoint, {
            commitSha: f.revision,
            now,
          }),
          { commitSha: f.revision, deploymentRunId: 100, now },
        ),
      ),
    );
    expect(full).toEqual({
      ...f.full,
      authorized_canary_run_id: canary.run_id,
      updated_at: now,
    });
    expect(hasConfirmedEnrichmentCanary(f.state, full)).toBe(true);
    expect(await runPublicationWriterFinalization(f.input)).toEqual({
      status: "already-finalized",
    });
    expect(f.commit).toHaveBeenCalledOnce();
    expect(f.persist).toHaveBeenCalledOnce();
    expect(f.input.gh).not.toHaveBeenCalled();
  } finally {
    await f.cleanup();
  }
});

test("fresh inventory clocks do not repeatedly supersede an unchanged deployment approval", async () => {
  const f = await fixture();
  try {
    const load = vi.fn(async () => {
      f.state.nowMs += 1000;
      return f.state;
    });
    expect(
      await runPublicationWriterFinalization({ ...f.input, load }),
    ).toEqual({ status: "finalized" });
    expect(f.commit).toHaveBeenCalledOnce();
  } finally {
    await f.cleanup();
  }
});

test("a verified descendant deployment can confirm an unchanged canary after other catalog work advances main", async () => {
  const f = await fixture();
  try {
    await f.save(
      "data/registry/projects/unrelated.json",
      '{"id":"unrelated"}\n',
    );
    f.git("add", "data");
    f.git("commit", "-m", "Other catalog work");
    const deployed = f.git("rev-parse", "HEAD");
    f.state.local.revision = deployed;
    f.state.remote.mainHeadSha = deployed;
    f.deployment.sourceSha = deployed;
    f.deployment.confirmation.sourceSha = deployed;
    f.state.local.confirmedRevisions = [f.revision, deployed];
    expect(await runPublicationWriterFinalization(f.input)).toEqual({
      status: "finalized",
    });
    expect(f.state.local.enrichmentCanary).toMatchObject({
      publication: { checkpoint_commit_sha: f.revision },
      deployment: { commit_sha: deployed, run_id: 100 },
    });
    expect(
      hasConfirmedEnrichmentCanary(
        f.state,
        f.state.local.enrichmentFull as typeof f.full,
      ),
    ).toBe(true);
    expect(f.commit).toHaveBeenCalledOnce();
  } finally {
    await f.cleanup();
  }
});

test("full deployment finalization preserves its frozen manifest and records the actual verified run once", async () => {
  const f = await fixture();
  try {
    await runPublicationWriterFinalization(f.input);
    let full = f.state.local.enrichmentFull as typeof f.full;
    full = createEnrichmentReport(
      applyAttemptResults(
        full,
        ["b", "c", "d"].map((id) => ({
          id,
          phase: "primary" as const,
          outcome: "enriched" as const,
        })),
        now,
        { checkpointLimit: 3 },
      ),
    );
    f.state.local.enrichmentFull = full;
    const admitted = discoverEnrichmentOperations(f.state)[0];
    const partialContent = await formatJson(full),
      partialResult = preparedResultFixture();
    const partialOperation = {
      ...admitted,
      identity: {
        ...admitted.identity,
        subject: "maintenance:enrichment:prior-checkpoint",
        inputDigest: "9".repeat(64),
      },
    };
    partialOperation.key = operationKey(partialOperation.identity);
    Object.assign(partialResult, {
      kind: "enrichment",
      operationKey: partialOperation.key,
      inputDigest: partialOperation.identity.inputDigest,
      policyVersion: partialOperation.identity.policyVersion,
      producer: {
        workflow: ".github/workflows/enrich-catalog.yml",
        runId: 98,
        sourceSha: f.state.local.revision,
      },
      files: [
        {
          path: "data/reports/enrichment-report.json",
          type: "file",
          content: partialContent,
          bytes: Buffer.byteLength(partialContent),
          sha256: createHash("sha256").update(partialContent).digest("hex"),
          baseDigest: null,
        },
      ],
    });
    const partialRecord = createCanonicalPublicationRecord({
      result: partialResult,
      operation: partialOperation,
    });
    await f.save("data/reports/enrichment-report.json", partialContent);
    await f.save(
      `data/maintenance/automation/publications/${partialOperation.key}.json`,
      `${JSON.stringify(partialRecord, null, 2)}\n`,
    );
    f.git("add", "data");
    f.git("commit", "-m", "Prior native running checkpoint");
    const checkpoint = createEnrichmentReport(
      applyAttemptResults(
        full,
        [
          {
            id: "e",
            phase: "primary",
            outcome: "enriched",
            provider: {
              requestedModel: model,
              returnedModel: model,
              latencyMs: 1,
            },
          },
        ],
        now,
        { checkpointLimit: 1 },
      ),
    );
    const path = "data/reports/enrichment-report.json",
      content = await formatJson(checkpoint);
    const result = preparedResultFixture();
    Object.assign(result, {
      kind: "enrichment",
      operationKey: admitted.key,
      inputDigest: admitted.identity.inputDigest,
      policyVersion: admitted.identity.policyVersion,
      producer: {
        workflow: ".github/workflows/enrich-catalog.yml",
        runId: 101,
        sourceSha: f.state.local.revision,
      },
      files: [
        {
          path,
          type: "file",
          content,
          bytes: Buffer.byteLength(content),
          sha256: createHash("sha256").update(content).digest("hex"),
          baseDigest: null,
        },
      ],
    });
    const record = createCanonicalPublicationRecord({
      result,
      operation: admitted,
    });
    await f.save(path, content);
    await f.save(
      `data/maintenance/automation/publications/${admitted.key}.json`,
      `${JSON.stringify(record, null, 2)}\n`,
    );
    f.git("add", "data");
    f.git("commit", "-m", "Full native checkpoint");
    const revision = f.git("rev-parse", "HEAD");
    const previous = f.state.local.publications as Array<{
      record: typeof record;
      revision: string;
    }>;
    const proof = await readCanonicalPublicationEvidence({
      root: f.state.root,
      revision,
      records: [
        partialRecord,
        ...previous.map((value) => value.record),
        record,
      ],
    });
    f.state.local.publications = [...proof.publications].sort(
      (left, right) =>
        Number(right.record.operation.key === partialOperation.key) -
        Number(left.record.operation.key === partialOperation.key),
    );
    f.state.local.publicationFileDigests = proof.fileDigests;
    f.state.local.revision = revision;
    f.state.remote.mainHeadSha = revision;
    f.state.local.enrichmentFull = checkpoint;
    f.state.local.deployments = [
      f.deployment,
      {
        ...f.deployment,
        sourceSha: revision,
        workflowRunId: 102,
        confirmation: { ...f.deployment.confirmation, sourceSha: revision },
      },
    ];
    f.state.local.confirmedRevisions = [f.revision, revision];
    f.state.operations = [
      { ...admitted, expectedSha: revision, stage: "deployment-confirmed" },
    ];
    const input = { ...f.input, operationKey: admitted.key };
    expect(
      assessInventoryHealth(f.state).some(
        (value) => value.code === "enrichment-unresolved",
      ),
    ).toBe(false);
    expect(await runPublicationWriterFinalization(input)).toEqual({
      status: "finalized",
    });
    expect(f.state.local.enrichmentFull).toMatchObject({
      run_id: f.full.run_id,
      manifest: f.full.manifest,
      batch_size: 30,
      concurrency: 6,
      status: "complete",
      primary_cursor: 5,
      publication: { checkpoint_commit_sha: revision },
      deployment: { commit_sha: revision, run_id: 102 },
    });
    expect(
      assessInventoryHealth(f.state).find(
        (value) => value.code === "enrichment-unresolved",
      ),
    ).toMatchObject({ status: "recovered", count: 0, revision });
    f.state.local.publicationFileDigests = {};
    expect(
      assessInventoryHealth(f.state).some(
        (value) => value.code === "enrichment-unresolved",
      ),
    ).toBe(false);
    f.state.local.publicationFileDigests = proof.fileDigests;
    expect(await runPublicationWriterFinalization(input)).toEqual({
      status: "already-finalized",
    });
    expect(f.commit).toHaveBeenCalledTimes(2);
    expect(f.persist).toHaveBeenCalledTimes(2);
    expect(f.input.gh).not.toHaveBeenCalled();
  } finally {
    await f.cleanup();
  }
}, 30_000);

test.each(["browser", "bundle", "run", "history"])(
  "missing native %s proof cannot approve a canary or resume full work",
  async (variant) => {
    const f = await fixture();
    try {
      if (variant === "browser")
        f.deployment.confirmation.essentialSmokePassed = false;
      if (variant === "bundle") f.deployment.bundleDigest = "f".repeat(64);
      if (variant === "run") f.deployment.workflowRunId = 0;
      if (variant === "history") f.state.local.publicationFileDigests = {};
      expect(await runPublicationWriterFinalization(f.input)).toEqual({
        status: "waiting",
      });
      expect(f.commit).not.toHaveBeenCalled();
      expect(f.state.local.enrichmentCanary).toEqual(f.checkpoint);
      expect(f.state.local.enrichmentFull).toEqual(f.full);
    } finally {
      await f.cleanup();
    }
  },
);

test.each(["metadata", "identity", "delist"])(
  "a descendant deployment with changed canary %s cannot authorize full enrichment",
  async (variant) => {
    const f = await fixture();
    try {
      const projects = f.state.local.projects as Array<Record<string, unknown>>;
      const sources = f.state.local.sources as Array<Record<string, unknown>>;
      if (variant === "identity")
        await f.save(
          "data/registry/sources/github-a.json",
          await formatJson({ ...sources[0], repository_id: 43 }),
        );
      else
        await f.save(
          "data/registry/projects/a.json",
          await formatJson({
            ...projects[0],
            ...(variant === "metadata"
              ? { summary: "New owner summary." }
              : { listing_status: "delisted" }),
          }),
        );
      f.git("add", "data");
      f.git("commit", "-m", "Owner/source change");
      const deployed = f.git("rev-parse", "HEAD");
      f.state.local.revision = deployed;
      f.state.remote.mainHeadSha = deployed;
      f.deployment.sourceSha = deployed;
      f.deployment.confirmation.sourceSha = deployed;
      expect(await runPublicationWriterFinalization(f.input)).toEqual({
        status: "waiting",
      });
      expect(f.commit).not.toHaveBeenCalled();
      expect(f.state.local.enrichmentFull).toEqual(f.full);
    } finally {
      await f.cleanup();
    }
  },
);

test("a lost approval commit response is recovered without repeating any model work or report commit", async () => {
  const f = await fixture();
  try {
    const commit = async (input: Parameters<typeof f.commit>[0]) => {
      await f.commit(input);
      throw Object.assign(new Error("Lost response"), {
        code: "provider-network-error",
      });
    };
    await expect(
      runPublicationWriterFinalization({ ...f.input, commit }),
    ).rejects.toMatchObject({ code: "provider-network-error" });
    expect(f.state.local.enrichmentCanary).toMatchObject({ status: "passed" });
    f.state.nowMs += 3_600_000;
    expect(await runPublicationWriterFinalization(f.input)).toEqual({
      status: "finalized",
    });
    expect(f.commit).toHaveBeenCalledOnce();
    expect(f.input.gh).not.toHaveBeenCalled();
    expect(
      hasConfirmedEnrichmentCanary(
        f.state,
        f.state.local.enrichmentFull as typeof f.full,
      ),
    ).toBe(true);
  } finally {
    await f.cleanup();
  }
});

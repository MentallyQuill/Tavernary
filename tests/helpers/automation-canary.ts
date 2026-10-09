import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { zipSync, strToU8 } from "fflate";
import {
  projectInventoryFixture,
  kitInventoryFixture,
  preparedResultFixture,
  preparedResultContextFixture,
} from "./automation-fixtures";
import { confirmationFixture } from "./confirmation-fixtures";
import { discoverProjectOperations } from "../../scripts/automation/project-operations.mjs";
import { discoverKitOperations } from "../../scripts/automation/kit-operations.mjs";
import { discoverDeploymentOperations } from "../../scripts/automation/deployment-operations.mjs";
import { discoverCanonicalPublications } from "../../scripts/automation/publication-record.mjs";
import { reconcileAutomation } from "../../scripts/automation/reconcile.mjs";
import { runAutomationWorker } from "../../scripts/automation/worker.mjs";
import {
  publishProjectOperation,
  loadProjectMergePlan,
  mergeExactProjectHead,
} from "../../scripts/automation/project-merge.mjs";
import { publishPreparedOperation } from "../../scripts/automation/prepared-publication.mjs";
import { createPreparedPublicationContext } from "../../scripts/automation/publication-context.mjs";
import { acquirePreparedKitData } from "../../scripts/automation/kit-preparation.mjs";
import { loadPreparedGithubResult } from "../../scripts/automation/prepared-github.mjs";
import { runDeploymentWriterConfirmation } from "../../scripts/automation/writer-runtime.mjs";
import { finalizeAutomationOperation } from "../../scripts/automation/finalization.mjs";
import { projectAutomationLifecycle } from "../../scripts/automation/lifecycle-github.mjs";
import { persistGithubAutomationReceipt } from "../../scripts/automation/github-inventory.mjs";
import { applyFinalizationReceipt } from "../../scripts/automation/finalization.mjs";
import { confirmDeployment } from "../../scripts/automation/confirm-deployment.mjs";
import { buildRevisionManifest } from "../../scripts/automation/revision-manifest.mjs";
import { planDeployment } from "../../scripts/automation/deployment-plan.mjs";
import {
  parseProjectPublicationTransaction,
  PROJECT_PUBLICATION_TRANSACTION_MARKER,
  fingerprintProjectPublicationInput,
} from "../../scripts/publication/project-publication-transaction.mjs";
import { fingerprintProjectRecord } from "../../src/features/help/project-owner-record.mjs";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
import type { AutomationOperation } from "../../scripts/automation/operation.mjs";
import type { AutomationReceipt } from "../../scripts/automation/receipts.mjs";
import type {
  PreparedFile,
  PreparedResult,
} from "../../scripts/automation/prepared-result.mjs";
import type { GhRunner } from "../../scripts/submissions/kit-submission-reconciliation.mjs";
import type { ActiveDeployment } from "../../scripts/automation/deployment-state.mjs";
import type { CanonicalPublicationRecord } from "../../scripts/automation/publication-record.mjs";
import type { ConfirmedDeployment } from "../../scripts/automation/confirm-deployment.mjs";

type Kind = "project" | "owner-request" | "kit" | "refresh";
type Guard = "manual" | "owner-decline" | "foreign-publisher" | "changed-input";
type Effect = { type: string; path?: string; revision?: string };
const repository = "MentallyQuill/Tavernary",
  publisherActorId = 41_982_982;
const hash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");

/** Owned offline fixtures. Every remote request is injected; no GitHub CLI or provider is invoked. */
export async function automationCanary({
  kind,
  guard,
  outageHours,
}: {
  kind: Kind;
  guard?: Guard;
  outageHours: number;
}) {
  if (
    !["project", "owner-request", "kit", "refresh"].includes(kind) ||
    outageHours !== 72
  )
    throw new Error("Canary scope is invalid.");
  const root = await mkdtemp(resolve(tmpdir(), "tavernary-canary-"));
  const git = (args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }).trim();
  const write = async (path: string, content: string) => {
    await mkdir(dirname(resolve(root, path)), { recursive: true });
    await writeFile(resolve(root, path), content);
  };
  git(["init", "--initial-branch=main"]);
  git(["config", "user.name", "Owned fixture"]);
  git(["config", "user.email", "fixture@example.com"]);
  for (const name of [
    "frontends",
    "primary-functions",
    "tags",
    "model-families",
    "completion-formats",
  ]) {
    await mkdir(resolve(root, "data/vocabularies"), { recursive: true });
    await copyFile(
      resolve(process.cwd(), `data/vocabularies/${name}.json`),
      resolve(root, `data/vocabularies/${name}.json`),
    );
  }
  await mkdir(resolve(root, "data/schemas"), { recursive: true });
  for (const name of [
    "project",
    "repository-snapshot",
    "extension-install-evidence",
    "catalog-policy-review",
    "kit",
    "kit-support-snapshot",
    "github-refresh",
  ])
    await copyFile(
      resolve(process.cwd(), `data/schemas/${name}.schema.json`),
      resolve(root, `data/schemas/${name}.schema.json`),
    );
  git(["add", "."]);
  git(["commit", "-m", "owned baseline"]);
  const baseSha = git(["rev-parse", "HEAD"]);
  const initialNow = Date.parse("2026-10-31T23:00:00Z");
  const effects: Effect[] = [],
    receipts = new Map<string, AutomationReceipt>();
  let nowMs = initialNow,
    publicationSha: string | null = null,
    proofSha: string | null = null;
  let served: ReturnType<typeof confirmationFixture> | null = null;
  let dropPublicationResponse = true,
    dropConfirmationResponse = true,
    dropFinalizationResponse = true;
  let dropLifecycleResponse = true;
  const project = projectInventoryFixture({
    producer:
      kind === "owner-request" ? "project-owner-request" : "project-submission",
    generatedPull: { mergeable: true } as never,
    validationRun: {},
    publicationMode: guard === "manual" ? "manual" : "automatic",
  });
  project.issues[0].labels.push("submission-pr-open");
  const transaction = parseProjectPublicationTransaction(
    project.pulls[0].body,
  )!;
  transaction.base_sha = baseSha;
  if (kind === "owner-request") {
    const fingerprint = fingerprintProjectRecord(project.catalog.projects[0]);
    const manifest = JSON.parse(
      project.issues[0].body!.split("\n").slice(1).join("\n"),
    );
    manifest.project_fingerprint = fingerprint;
    project.issues[0].body = `### Owner request manifest\n${JSON.stringify(manifest)}`;
    transaction.input_fingerprints.projects["example-project"] = fingerprint;
    transaction.input_digest = fingerprintProjectPublicationInput(manifest);
  }
  project.pulls[0].body = `${PROJECT_PUBLICATION_TRANSACTION_MARKER}\n${JSON.stringify(transaction)}\n-->`;
  const kit = kitInventoryFixture();
  const refresh = preparedResultContextFixture();
  const local = {
    revision: baseSha,
    projects: kind === "kit" ? kit.projects : project.catalog.projects,
    sources:
      kind === "kit" ? Object.values(kit.sourcesById) : project.catalog.sources,
    snapshots: [],
    kits: [] as unknown[],
    blockedUsers: { blocked: [] },
    kitSnapshots: [],
    trustedEditors: { schema_version: 1, editors: [] },
    publications: [] as Array<{
      record: CanonicalPublicationRecord;
      revision: string;
    }>,
    publicationFileDigests: {} as Record<string, string>,
    deployments: [] as ConfirmedDeployment[],
    confirmedRevisions: [] as string[],
    activeDeployment: null as ActiveDeployment | null,
  } satisfies AutomationInventoryState["local"];
  const state: AutomationInventoryState = {
    root,
    repository,
    publisherActorId,
    nowMs,
    local,
    operations: [],
    receipts: [],
    remote: {
      issues: kind === "kit" ? (kit.issues as never) : project.issues,
      pulls: kind === "kit" || kind === "refresh" ? [] : project.pulls,
      runs: project.runs,
      mainHeadSha: baseSha,
    },
  };
  const recompute = () => {
    state.nowMs = nowMs;
    state.receipts = [...receipts.values()];
    let operations: AutomationOperation[];
    if (kind === "project" || kind === "owner-request") {
      operations = discoverProjectOperations({
        ...project,
        issues: state.remote.issues,
        pulls: state.remote.pulls,
        runs: state.remote.runs,
        receipts: state.receipts,
        nowMs,
        catalog: {
          ...project.catalog,
          confirmedRevisions: local.confirmedRevisions,
        },
      });
    } else if (publicationSha) {
      operations = discoverCanonicalPublications({
        records: local.publications!,
        fileDigests: local.publicationFileDigests!,
        receipts: state.receipts,
        confirmedRevisions: local.confirmedRevisions,
        nowMs,
      });
    } else if (kind === "kit")
      operations = discoverKitOperations({
        ...kit,
        nowMs,
        receipts: state.receipts,
      });
    else
      operations = [
        { ...refresh.operation, createdAt: new Date(initialNow).toISOString() },
      ];
    state.operations = operations.map((operation) =>
      applyFinalizationReceipt(operation, state.receipts),
    );
    return state;
  };
  recompute();
  const original = state.operations[0];
  if (!original && !guard) throw new Error("Owned fixture has no operation.");
  if (guard === "owner-decline")
    project.issues[0].labels.push("submission-declined");
  if (guard === "foreign-publisher") project.pulls[0].user.id = 99;
  if (guard === "changed-input") {
    const manifest = JSON.parse(
      project.issues[0].body!.split("\n").slice(1).join("\n"),
    );
    manifest.additional_context = "Changed after validated generation.";
    project.issues[0].body = `### Project manifest\n${JSON.stringify(manifest)}`;
  }

  const commit = async ({
    expectedMainSha,
    files,
  }: {
    expectedMainSha: string;
    files: PreparedFile[];
  }) => {
    if (expectedMainSha !== git(["rev-parse", "HEAD"]))
      throw new Error("Fixture CAS failed");
    for (const file of files) {
      if (
        !file.path.startsWith("data/") ||
        file.path.includes("..") ||
        hash(file.content) !== file.sha256
      )
        throw new Error("Fixture write failed integrity");
      await write(file.path, file.content);
    }
    git(["add", "."]);
    git(["commit", "-m", "observed fixture effect"]);
    const revision = git(["rev-parse", "HEAD"]);
    local.revision = state.remote.mainHeadSha = revision;
    if (
      files.some(
        (file) => !file.path.startsWith("data/maintenance/automation/"),
      )
    ) {
      effects.push({ type: "canonical-publication", revision });
      publicationSha = revision;
      for (const file of files) {
        if (file.path.startsWith("data/registry/kits/"))
          local.kits.push(JSON.parse(file.content));
        local.publicationFileDigests![`${revision}:${file.path}`] = hash(
          file.content,
        );
        if (file.path.startsWith("data/maintenance/automation/publications/"))
          local.publications!.push({
            record: JSON.parse(file.content),
            revision,
          });
      }
      if (dropPublicationResponse) {
        dropPublicationResponse = false;
        throw Object.assign(new Error("publication response dropped"), {
          status: 503,
        });
      }
    } else if (
      files.some((file) => file.path.endsWith("/deployments/current.json"))
    ) {
      for (const file of files) {
        if (file.path.endsWith("/current.json"))
          local.activeDeployment = JSON.parse(file.content) as ActiveDeployment;
        else local.deployments.push(JSON.parse(file.content));
      }
      local.confirmedRevisions = [publicationSha!];
      proofSha = revision;
      effects.push({ type: "deployment-confirmation", revision });
      if (dropConfirmationResponse) {
        dropConfirmationResponse = false;
        throw Object.assign(new Error("confirmation response dropped"), {
          status: 503,
        });
      }
    }
    return { sha: revision };
  };
  let prepared: PreparedResult | null = null;
  const artifactRun = {
    ...refresh.run,
    id: 700,
    run_attempt: 1,
    head_sha: baseSha,
    repository: { id: 100, full_name: repository },
    head_repository: { id: 100, full_name: repository },
  };
  let archive: Uint8Array | null = null;
  const comments = [
    {
      id: 103,
      user: { id: publisherActorId, type: "Bot" },
      body: '<!-- tavernary-project-validation-state\n{"schema_version":1,"status":"validated","attempts":1}\n-->\nValidated',
    },
  ];
  const nativeGh: GhRunner = async (args, body) => {
    const route =
      args.find(
        (arg) => arg.startsWith("repos/") || arg.startsWith("repositories/"),
      ) ?? "";
    const method = args.includes("--method")
      ? args[args.indexOf("--method") + 1]
      : "GET";
    if (args[0] === "workflow") {
      const workflow = args[2];
      effects.push({ type: "dispatch", path: workflow });
      if (workflow === "deploy-pages.yml") {
        if (!publicationSha) throw new Error("Deployment before publication");
        const decision = planDeployment({
          requestedSha: publicationSha,
          currentMainSha: local.revision,
          latestPublishableSha: publicationSha,
          validatedSha: publicationSha,
          deployedSha: local.activeDeployment?.deployment.sourceSha ?? null,
          mode: "ordinary",
          isAncestor: (a, b) =>
            git(["merge-base", "--is-ancestor", a, b]) === "",
        });
        if (decision.action === "deploy" && !served) {
          served = confirmationFixture();
          served.publicManifest.sourceSha = publicationSha;
          const base = served.input.expected;
          served.input.expected = buildRevisionManifest({
            sourceSha: publicationSha,
            buildId: base.buildId,
            catalog: JSON.parse(
              Buffer.from(
                served.content["catalog/tavernary-catalog-v8.json"],
              ).toString(),
            ),
            targets: JSON.parse(
              Buffer.from(
                served.content["security/tavernkeeper-targets.json"],
              ).toString(),
            ),
            files: base.assets,
          });
          Object.assign(served.publicManifest, served.input.expected);
          effects.push({ type: "pages-deployment", revision: publicationSha });
          throw Object.assign(
            new Error("deployment wake dropped after success"),
            { status: 503 },
          );
        }
      }
      return "";
    }
    if (route.endsWith("PROJECT_AUTO_PUBLICATION_ENABLED"))
      return JSON.stringify({ value: "true" });
    if (route.endsWith("/pulls/84")) return JSON.stringify(project.pulls[0]);
    if (route.includes("/issues/42/comments?")) return JSON.stringify(comments);
    if (route.endsWith("/issues/comments/103") && method === "PATCH") {
      Object.assign(comments[0], JSON.parse(body!));
      effects.push({ type: "lifecycle-mutation", path: route });
      return JSON.stringify(comments[0]);
    }
    if (route.endsWith("/issues/42")) {
      const issue = state.remote.issues[0];
      if (method === "PATCH") {
        Object.assign(issue, JSON.parse(body!));
        effects.push({ type: "lifecycle-mutation", path: route });
        if (dropLifecycleResponse) {
          dropLifecycleResponse = false;
          throw Object.assign(new Error("lifecycle response dropped"), {
            status: 503,
          });
        }
      } else if (method !== "GET") throw new Error("Unexpected issue mutation");
      return JSON.stringify(issue);
    }
    if (route.includes("/labels/")) {
      if (method === "DELETE") {
        const name = decodeURIComponent(route.split("/").at(-1)!);
        const issue = state.remote.issues[0];
        issue.labels = issue.labels.filter(
          (label) => (typeof label === "string" ? label : label.name) !== name,
        );
        effects.push({ type: "lifecycle-mutation", path: route });
      } else if (method !== "GET") throw new Error("Unexpected label mutation");
      return "{}";
    }
    if (route.endsWith("/issues/42/labels") && method === "POST") {
      state.remote.issues[0].labels.push(...JSON.parse(body!).labels);
      effects.push({ type: "lifecycle-mutation", path: route });
      return "{}";
    }
    if (route.endsWith("/pulls/84/files"))
      return JSON.stringify([
        transaction.generated_paths.map((filename) => ({ filename })),
      ]);
    if (route === "repositories/42")
      return JSON.stringify({ id: 42, owner: { id: 1, type: "User" } });
    if (route.endsWith("/actions/runs/701"))
      return JSON.stringify({
        ...project.runs[0],
        id: 701,
        name: "Site: Validate changes",
        head_repository: { full_name: repository },
        actor: { id: publisherActorId, type: "Bot" },
      });
    if (route.endsWith("/pulls/84/merge")) {
      const request = JSON.parse(body!);
      if (request.sha !== project.pulls[0].head.sha || guard) {
        effects.push({ type: "authority-violation" });
        throw new Error("Unauthorized fixture merge");
      }
      for (const path of transaction.generated_paths)
        await write(
          path,
          JSON.stringify(
            path.includes("/projects/")
              ? {
                  ...project.catalog.projects[0],
                  ...(kind === "owner-request"
                    ? {
                        listing_status: "retired",
                        listing_status_reason: "owner-request",
                      }
                    : {}),
                }
              : path.includes("/sources/")
                ? project.catalog.sources[0]
                : { source_id: "github-42", repository_id: 42 },
          ),
        );
      git(["add", "."]);
      git(["commit", "-m", "observed exact-head merge"]);
      publicationSha = git(["rev-parse", "HEAD"]);
      local.revision = state.remote.mainHeadSha = publicationSha;
      Object.assign(project.pulls[0], {
        state: "closed",
        merged_at: new Date(nowMs).toISOString(),
        merge_commit_sha: publicationSha,
      });
      effects.push({ type: "canonical-publication", revision: publicationSha });
      if (dropPublicationResponse) {
        dropPublicationResponse = false;
        throw Object.assign(new Error("merge response dropped"), {
          status: 503,
        });
      }
      return JSON.stringify({ merged: true, sha: publicationSha });
    }
    if (route.includes("/reactions?")) return "[]";
    if (route.includes("/contents/data/maintenance/automation/operations/")) {
      const key = /\/([a-f0-9]{64})\.json/u.exec(route)![1];
      if (!args.includes("PUT")) {
        const saved = receipts.get(key);
        if (!saved) throw Object.assign(new Error("HTTP 404"), { status: 404 });
        return JSON.stringify({
          encoding: "base64",
          sha: git([
            "hash-object",
            `data/maintenance/automation/operations/${key}.json`,
          ]),
          content: Buffer.from(JSON.stringify(saved)).toString("base64"),
        });
      }
      const receipt = JSON.parse(
        Buffer.from(JSON.parse(body!).content, "base64").toString(),
      ) as AutomationReceipt;
      receipts.set(key, receipt);
      await write(
        `data/maintenance/automation/operations/${key}.json`,
        JSON.stringify(receipt),
      );
      git(["add", "."]);
      git(["commit", "-m", "observed receipt"]);
      local.revision = state.remote.mainHeadSha = git(["rev-parse", "HEAD"]);
      if (receipt.operation.stage === "finalized") {
        effects.push({ type: "finalization", revision: local.revision });
        if (dropFinalizationResponse) {
          dropFinalizationResponse = false;
          throw Object.assign(new Error("finalization response dropped"), {
            status: 503,
          });
        }
      }
      return "{}";
    }
    if (route.endsWith("/actions/runs/700")) return JSON.stringify(artifactRun);
    if (route.endsWith("/actions/runs/700/artifacts"))
      return JSON.stringify([
        {
          total_count: 1,
          artifacts: [
            {
              id: 88,
              name: `automation-prepared-${prepared!.operationKey}`,
              expired: false,
              size_in_bytes: archive!.length,
              digest: `sha256:${hash(archive!)}`,
              workflow_run: {
                id: 700,
                head_branch: "main",
                head_sha: baseSha,
                repository_id: 100,
                head_repository_id: 100,
              },
            },
          ],
        },
      ]);
    if (route.endsWith("/actions/runs/42"))
      return JSON.stringify({
        id: 42,
        run_attempt: 1,
        path: ".github/workflows/deploy-pages.yml",
        display_title: `Site: Deploy ${publicationSha}`,
        head_branch: "main",
        head_sha: publicationSha,
        event: "workflow_dispatch",
        status: "completed",
        conclusion: "cancelled",
        actor: { id: publisherActorId, type: "Bot" },
        repository: { id: 100, full_name: repository },
        head_repository: { id: 100, full_name: repository },
      });
    if (route.endsWith("/actions/runs/42/artifacts")) {
      const bytes = zipSync({
        "revision.json": strToU8(JSON.stringify(served!.input.expected)),
      });
      return JSON.stringify([
        {
          total_count: 1,
          artifacts: [
            {
              id: 89,
              name: `site-revision-${publicationSha}`,
              expired: false,
              size_in_bytes: bytes.length,
              digest: `sha256:${hash(bytes)}`,
              workflow_run: {
                id: 42,
                head_branch: "main",
                head_sha: publicationSha,
                repository_id: 100,
                head_repository_id: 100,
              },
            },
          ],
        },
      ]);
    }
    throw new Error(`Unexpected native fixture request ${args.join(" ")}`);
  };
  const persist = (receipt: AutomationReceipt) =>
    persistGithubAutomationReceipt({ gh: nativeGh, repository, receipt });
  if (kind === "kit" || kind === "refresh") {
    const context =
      kind === "kit"
        ? await createPreparedPublicationContext({ state, operation: original })
        : { ...refresh.currentState, mainSha: baseSha };
    const outputs =
      kind === "kit"
        ? await acquirePreparedKitData({
            state,
            operation: original,
            gh: nativeGh,
          })
        : Object.fromEntries(
            preparedResultFixture().files.map((file) => [
              file.path,
              file.content,
            ]),
          );
    prepared = preparedResultFixture({
      operationKey: original.key,
      kind,
      inputDigest: original.identity.inputDigest,
      policyVersion: original.identity.policyVersion,
      baseSha,
      source: context.source,
      authorId: context.authorId,
      producer: {
        runId: 700,
        sourceSha: baseSha,
        workflow:
          kind === "kit"
            ? ".github/workflows/apply-kit-submission.yml"
            : ".github/workflows/refresh-catalog.yml",
      },
      files: Object.entries(outputs).map(([path, content]) => ({
        path,
        content,
        type: "file",
        bytes: Buffer.byteLength(content),
        sha256: hash(content),
        baseDigest: null,
      })),
    });
    artifactRun.path = prepared.producer.workflow;
    archive = zipSync({ "result.json": strToU8(JSON.stringify(prepared)) });
  }
  // The durable preparation exists before cancellation; all event deliveries are omitted.
  effects.push({ type: "durable-preparation" });
  const publish = async () => {
    recompute();
    if (!state.operations.length) return;
    if (kind === "project" || kind === "owner-request")
      await publishProjectOperation({
        operationKey: original?.key ?? state.operations[0].key,
        load: async () => recompute(),
        plan: (input) => loadProjectMergePlan({ ...input, gh: nativeGh }),
        merge: (action) =>
          mergeExactProjectHead({ repository, gh: nativeGh, action }),
        persist,
      });
    else
      await publishPreparedOperation({
        operationKey: original.key,
        runId: 700,
        load: async () => recompute(),
        context: (inventory, operation) =>
          kind === "kit"
            ? createPreparedPublicationContext({ state: inventory, operation })
            : Promise.resolve({
                ...refresh.currentState,
                mainSha: inventory.remote.mainHeadSha,
              }),
        loadResult: async ({ operation, currentState }) => ({
          result: await loadPreparedGithubResult({
            gh: nativeGh,
            download: async () => archive!,
            repository,
            runId: 700,
            operation,
            publisherActorId,
            currentState,
          }),
          run: artifactRun,
        }),
        build: async ({ files }) => files,
        commit,
        persist,
      });
  };
  const recover = async () => {
    for (let pass = 0; pass < 6; pass++) {
      try {
        await publish();
      } catch (error) {
        if ((error as { status?: number }).status !== 503) throw error;
        nowMs = initialNow + outageHours * 3600000;
        recompute();
        continue;
      }
      if (!publicationSha) break;
      if (!served) {
        const site = confirmationFixture().input.expected;
        const deploy = discoverDeploymentOperations({
          mainHeadSha: local.revision,
          latestPublishableSha: publicationSha,
          mainCommits: [
            {
              sha: publicationSha,
              committedAt: new Date(nowMs).toISOString(),
              publishable: true,
              catalogDigest: site.catalogDigest,
              targetDigest: site.targetDigest,
            },
          ],
          deployments: [],
          receipts: [],
          runs: [],
          nowMs,
          publisherActorId,
        });
        await reconcileAutomation({
          inventory: async () => deploy,
          nowMs,
          receipts: [],
          persist,
          dispatch: async (operation) => {
            await runAutomationWorker({
              operationKey: operation.key,
              load: async () => deploy,
              gh: nativeGh,
            });
            return {};
          },
        });
      }
      if (served) {
        served.input.nowMs = nowMs;
        try {
          await runDeploymentWriterConfirmation({
            runId: 42,
            env: {
              GITHUB_REPOSITORY: repository,
              GITHUB_REF: "refs/heads/main",
              GITHUB_EVENT_NAME: "workflow_dispatch",
              GITHUB_ACTOR_ID: String(publisherActorId),
              TAVERNARY_PUBLISHER_BOT_ID: String(publisherActorId),
              GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
            },
            gh: nativeGh,
            load: async () => recompute(),
            isAncestor: (a, b) => {
              try {
                git(["merge-base", "--is-ancestor", a, b]);
                return true;
              } catch {
                return false;
              }
            },
            download: async () =>
              zipSync({
                "revision.json": strToU8(
                  JSON.stringify(served!.input.expected),
                ),
              }),
            probe: () => confirmDeployment(served!.input),
            commit,
          });
        } catch (error) {
          if ((error as { status?: number }).status !== 503) throw error;
          continue;
        }
      }
      if (proofSha) {
        recompute();
        const current = state.operations.find(
          (operation) => operation.key === original.key,
        );
        if (!current) throw new Error("Confirmed publication disappeared");
        try {
          await finalizeAutomationOperation({
            operationKey: current.key,
            load: async () => recompute(),
            project: (operation, inventory) =>
              projectAutomationLifecycle({
                operation,
                state: inventory,
                gh: nativeGh,
                load: async () => recompute(),
                commit: async () => {
                  throw new Error("Lifecycle cannot republish");
                },
              }),
            persist,
          });
        } catch (error) {
          if ((error as { status?: number }).status !== 503) throw error;
          continue;
        }
      }
      break;
    }
  };
  return {
    recover,
    operation: () =>
      recompute().operations.find(
        (operation) => operation.key === original?.key,
      )!,
    issueState: () => structuredClone(state.remote.issues[0]),
    observedEffects: () => structuredClone(effects),
    effects: () => ({
      canonicalPublications: effects.filter(
        (effect) => effect.type === "canonical-publication",
      ).length,
      confirmedDeployments: effects.filter(
        (effect) => effect.type === "deployment-confirmation",
      ).length,
      finalizations: effects.filter((effect) => effect.type === "finalization")
        .length,
      lifecycleMutations: effects.filter(
        (effect) => effect.type === "lifecycle-mutation",
      ).length,
      authorityViolations: effects.filter(
        (effect) => effect.type === "authority-violation",
      ).length,
    }),
    close: () => rm(root, { recursive: true, force: true }),
  };
}

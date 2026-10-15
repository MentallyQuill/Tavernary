import { createHash } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
import type { AutomationReceipt } from "../../scripts/automation/receipts.mjs";

export function preparedReplayFixture() {
  const receipt: AutomationReceipt = {
    schema_version: 1,
    operation: {
      key: "1c3adda5b4ea23180aa6fc3a56873f2d0f404b7f714ae97c54b3d7789bed4493",
      identity: {
        kind: "advisory",
        subject: "source:github-1028124712:chew1976-dynamic-vars",
        inputDigest:
          "191b5e767ad73690847a98534203d0e4e13d7e869cde6e3736278384e2c3c1ee",
        policyVersion: "2026-07-29",
      },
      stage: "admitted",
      createdAt: "2026-10-08T14:39:08.801Z",
      nextEligibleAt: "2026-10-16T00:25:23.917Z",
      expectedSha: null,
      workerRunId: null,
      retry: {
        failure: { kind: "unknown", reasonCode: "unclassified-failure" },
        transientAttempts: 2,
        immediateAttempts: 3,
      },
    },
    updatedAt: "2026-10-15T00:25:23.917Z",
    completedAt: null,
  };
  return diagnosticReplayFixture(
    receipt,
    38596842504,
    "2026-10-14T16:20:16.000Z",
  );
}

export function auditedRefreshReplayFixtures() {
  return [
    {
      key: "13714c6b94fac3dd066343336271b549465f7db109c07d1372006802cb1d27e7",
      source: "github-1105308117",
      digest:
        "93c3307b2c4973f0e08ea4659088a46163f288a8192d677efa68abc8c4c54bcf",
      runId: 38420377921,
      terminalAt: "2026-10-13T15:15:38.000Z",
      receiptAt: "2026-10-15T10:39:52.076Z",
      deadline: "2026-10-16T10:39:52.076Z",
    },
    {
      key: "14e8ae0da8074976c1eb395d41568f64fa804c54228fb3a077d46243407c151f",
      source: "github-1180932701",
      digest:
        "42f2fa9e4b21a7f6b9d76d36eafc724459dabb94aada9e0428cb49113fbe1b7b",
      runId: 38420606473,
      terminalAt: "2026-10-13T15:16:58.000Z",
      receiptAt: "2026-10-15T10:42:08.755Z",
      deadline: "2026-10-16T10:42:08.755Z",
    },
    {
      key: "16442b453f937aa22c695454dc8371a9791a0a46ef4dc072c7fa897a06211ff7",
      source: "github-1244123455",
      digest:
        "89342a483b78646e28f7b4c4ccb38654ebcec6cb9f1bc7f998ce60a400005c66",
      runId: 38419632905,
      terminalAt: "2026-10-13T15:12:17.000Z",
      receiptAt: "2026-10-15T10:44:28.709Z",
      deadline: "2026-10-16T10:44:28.709Z",
    },
    {
      key: "17101c5c3b46ef25def57887cbee3dcb7cb8595274b6bb589fab75f13273ad0e",
      source: "github-1174011234",
      digest:
        "4c0d0e95cef31858ba4f995cd6b333bf636025b4b4776c8cf42408dcd75747ee",
      runId: 38419637257,
      terminalAt: "2026-10-13T15:12:18.000Z",
      receiptAt: "2026-10-15T10:46:50.993Z",
      deadline: "2026-10-16T10:46:50.993Z",
    },
  ].map((fixture) =>
    diagnosticReplayFixture(
      {
        schema_version: 1,
        operation: {
          key: fixture.key,
          identity: {
            kind: "refresh",
            subject: `source:${fixture.source}`,
            inputDigest: fixture.digest,
            policyVersion: "2026-07-29",
          },
          stage: "admitted",
          createdAt: "2026-10-08T14:39:08.801Z",
          nextEligibleAt: fixture.deadline,
          expectedSha: null,
          workerRunId: null,
          retry: {
            failure: { kind: "transient", reasonCode: "provider-rate-limited" },
            transientAttempts: 5,
            immediateAttempts: 0,
          },
        },
        updatedAt: fixture.receiptAt,
        completedAt: null,
      },
      fixture.runId,
      fixture.terminalAt,
    ),
  );
}

export function diagnosticReplayFixture(
  receipt: AutomationReceipt,
  runId: number,
  terminalAt: string,
) {
  const operation = structuredClone(receipt.operation);
  const run = {
    id: runId,
    run_attempt: 1,
    path: `.github/workflows/${operation.identity.kind === "advisory" ? "review-catalog-policy" : "refresh-catalog"}.yml`,
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: "b".repeat(40),
    actor: { id: 317929880, type: "Bot" },
    repository: { id: 1309605115, full_name: "MentallyQuill/Tavernary" },
    head_repository: { id: 1309605115, full_name: "MentallyQuill/Tavernary" },
    status: "completed",
    conclusion: "failure",
    display_title: `Automation prepare ${operation.key}`,
    created_at: new Date(Date.parse(terminalAt) - 60000).toISOString(),
    updated_at: terminalAt,
  };
  const diagnostic = {
    schema_version: 1,
    operation_key: operation.key,
    failure: structuredClone(operation.retry!.failure),
  };
  const archive = zipSync({
    "diagnostic.json": strToU8(JSON.stringify(diagnostic)),
  });
  const artifact = {
    id: runId + 1,
    name: `automation-failure-${operation.key}-${runId}`,
    expired: false,
    size_in_bytes: archive.length,
    digest: `sha256:${createHash("sha256").update(archive).digest("hex")}`,
    workflow_run: {
      id: runId,
      repository_id: 1309605115,
      head_repository_id: 1309605115,
      head_branch: "main",
      head_sha: run.head_sha,
    },
  };
  const state: AutomationInventoryState = {
    root: process.cwd(),
    repository: "MentallyQuill/Tavernary",
    publisherActorId: 317929880,
    nowMs: Date.parse(operation.nextEligibleAt!),
    receipts: [structuredClone(receipt)],
    operations: [operation],
    local: {
      revision: "b".repeat(40),
      sources: [],
      projects: [],
      deployments: [],
      kits: [],
    },
    remote: { runs: [run], pulls: [], issues: [], mainHeadSha: "b".repeat(40) },
  };
  const reader = {
    operation,
    repository: state.repository,
    publisherActorId: state.publisherActorId,
    runId,
    gh: async (args: string[]) =>
      JSON.stringify(
        args.some((argument) => /\/artifacts(?:\?|$)/u.test(argument))
          ? [{ total_count: 1, artifacts: [artifact] }]
          : run,
      ),
    download: async () => archive,
  };
  return { state, run, receipt, reader, artifact, diagnostic };
}

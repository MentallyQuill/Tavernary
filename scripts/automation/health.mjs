import { createHash } from "node:crypto";
import { AUTOMATION_FAILURE_REASON_CODES } from "./failure.mjs";
import { validateModelBudgetState } from "./model-budget.mjs";

export const HEALTH_TITLES = Object.freeze({
  "refresh-stale": "Repository refresh is stale",
  "import-stale": "A due factual report import is stale",
  "submission-stalled": "An automatic submission is stalled",
  "deployment-stalled": "Production confirmation is stalled",
  "provider-circuit": "An automation credential or provider needs repair",
  "budget-exhausted": "The model allowance is exhausted",
  "unknown-failure": "An automation failure needs investigation",
  "dependency-checks-failed": "A dependency update failed verification",
});
const subjectPattern =
  /^(?:refresh:(?:github|codeberg)|operation:[a-f0-9]{64}|dependency:(?:model-provider|publisher|budget)|deployment:pages|pull:[1-9]\d*)$/u;
const reasons = new Set([
  ...AUTOMATION_FAILURE_REASON_CODES,
  "observation-stale",
  "operation-stalled",
  "deployment-unconfirmed",
  "checks-failed",
  "verified-recovery",
]);

export function validateHealthFinding(value) {
  const key = createHash("sha256")
    .update(JSON.stringify([value?.code, value?.subject]))
    .digest("hex");
  if (
    !Object.hasOwn(HEALTH_TITLES, value?.code ?? "") ||
    !subjectPattern.test(value?.subject ?? "") ||
    value.key !== key ||
    !["active", "recovered"].includes(value.status) ||
    !Number.isSafeInteger(value.count) ||
    value.count < 0 ||
    value.count > 100_000 ||
    !reasons.has(value.reason) ||
    (value.revision !== undefined && !/^[a-f0-9]{40}$/u.test(value.revision))
  )
    throw new Error("Automation health finding is invalid.");
  return value;
}
function finding(
  code,
  subject,
  active,
  reason,
  count = active ? 1 : 0,
  revision,
) {
  return validateHealthFinding({
    key: createHash("sha256")
      .update(JSON.stringify([code, subject]))
      .digest("hex"),
    code,
    subject,
    status: active ? "active" : "recovered",
    reason,
    count,
    ...(revision ? { revision } : {}),
  });
}

export function assessAutomationHealth({
  operations = [],
  refreshState = [],
  importState = [],
  deploymentState,
  circuits = [],
  budget,
  dependencies = [],
  nowMs,
}) {
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(new Date(nowMs).getTime()) ||
    [operations, refreshState, importState, circuits, dependencies].some(
      (values) => !Array.isArray(values) || values.length > 100_000,
    )
  )
    throw new Error("Automation health observation is invalid.");
  const result = [];
  const age = (value) => {
    const time = Date.parse(value ?? "");
    return Number.isFinite(time) && time <= nowMs + 300_000
      ? nowMs - time
      : Infinity;
  };
  for (const provider of ["github", "codeberg"]) {
    const observations = refreshState.filter(
      (value) => value.required && value.provider === provider,
    );
    if (!observations.length) continue;
    const stale = observations.filter(
      (value) => age(value.refreshedAt) >= 48 * 3_600_000,
    ).length;
    if (stale || observations.every((value) => value.healthy !== false))
      result.push(
        finding(
          "refresh-stale",
          `refresh:${provider}`,
          stale > 0,
          stale ? "observation-stale" : "verified-recovery",
          stale,
        ),
      );
  }
  for (const item of importState) {
    const stale = !item.completed && age(item.dueAt) >= 24 * 3_600_000;
    result.push(
      finding(
        "import-stale",
        `operation:${item.key}`,
        stale,
        stale ? "observation-stale" : "verified-recovery",
      ),
    );
  }
  for (const operation of operations) {
    if (
      !operation.automatic ||
      operation.stage === "discovered" ||
      operation.retry?.failure.kind === "permanent"
    )
      continue;
    const subject = `operation:${operation.key}`;
    if (
      ["project", "owner-request", "kit", "withdrawal"].includes(
        operation.identity.kind,
      ) &&
      (!operation.nextEligibleAt ||
        Date.parse(operation.nextEligibleAt) <= nowMs)
    ) {
      const stale =
        !["deployment-confirmed", "finalized"].includes(operation.stage) &&
        age(operation.progressAt ?? operation.createdAt) >= 2 * 3_600_000;
      if (
        stale ||
        [
          "published",
          "deployment-requested",
          "deployment-confirmed",
          "finalized",
        ].includes(operation.stage)
      )
        result.push(
          finding(
            "submission-stalled",
            subject,
            stale,
            stale ? "operation-stalled" : "verified-recovery",
          ),
        );
    }
    if (
      operation.retry?.failure.kind === "unknown" &&
      operation.retry.immediateAttempts >= 3
    )
      result.push(
        finding("unknown-failure", subject, true, "unclassified-failure"),
      );
    else if (
      !operation.retry &&
      ["validated", "published", "deployment-confirmed", "finalized"].includes(
        operation.stage,
      )
    )
      result.push(
        finding("unknown-failure", subject, false, "verified-recovery"),
      );
  }
  if (deploymentState?.ordinary) {
    const confirmed =
      /^[a-f0-9]{40}$/u.test(deploymentState.latestRevision ?? "") &&
      deploymentState.activeRevision === deploymentState.latestRevision;
    if (confirmed || age(deploymentState.pendingSince) >= 2 * 3_600_000)
      result.push(
        finding(
          "deployment-stalled",
          "deployment:pages",
          !confirmed,
          confirmed ? "verified-recovery" : "deployment-unconfirmed",
          confirmed ? 0 : 1,
          deploymentState.latestRevision,
        ),
      );
  }
  for (const circuit of circuits)
    result.push(
      finding(
        "provider-circuit",
        circuit.subject,
        !circuit.recovered,
        circuit.recovered ? "verified-recovery" : circuit.reason,
      ),
    );
  if (budget)
    result.push(
      finding(
        "budget-exhausted",
        "dependency:budget",
        budget.exhausted,
        budget.exhausted ? "budget-exhausted" : "verified-recovery",
      ),
    );
  for (const dependency of dependencies) {
    if (!dependency.failed && !dependency.recovered) continue;
    result.push(
      finding(
        "dependency-checks-failed",
        `pull:${dependency.number}`,
        dependency.failed,
        dependency.failed ? "checks-failed" : "verified-recovery",
        dependency.failed ? 1 : 0,
        dependency.headSha,
      ),
    );
  }
  return result;
}

export function assessInventoryHealth(state) {
  const current = new Map(
    state.operations.map((operation) => [operation.key, operation]),
  );
  for (const receipt of state.receipts)
    if (
      receipt.operation.stage === "finalized" &&
      !current.has(receipt.operation.key)
    )
      current.set(receipt.operation.key, receipt.operation);
  const operations = [...current.values()].map((operation) => ({
    ...operation,
    automatic: true,
    progressAt:
      state.receipts.find((receipt) => receipt.operation.key === operation.key)
        ?.updatedAt ??
      state.remote.runs.find((run) => run.id === operation.workerRunId)
        ?.created_at ??
      operation.createdAt,
  }));
  const failures = operations.filter(
    (operation) => operation.retry?.failure.kind === "configuration",
  );
  const circuits = new Map();
  for (const operation of failures) {
    const reason = operation.retry.failure.reasonCode;
    if (reason === "budget-exhausted") continue;
    const subject =
      operation.identity.kind === "refresh"
        ? `refresh:${operation.identity.subject.startsWith("source:codeberg-") ? "codeberg" : "github"}`
        : reason === "publisher-authentication-failed"
          ? "dependency:publisher"
          : "dependency:model-provider";
    const previous = circuits.get(subject);
    if (!previous || reason.localeCompare(previous.reason) < 0)
      circuits.set(subject, { subject, reason, recovered: false });
  }
  const budget = state.local.modelBudget
    ? validateModelBudgetState(state.local.modelBudget)
    : null;
  for (const subject of [
    "dependency:publisher",
    "dependency:model-provider",
    "refresh:github",
    "refresh:codeberg",
  ]) {
    if (circuits.has(subject)) continue;
    const notices = state.remote.issues.filter(
      (issue) =>
        issue.user?.id === state.publisherActorId &&
        issue.user.type === "Bot" &&
        issue.body?.includes(`"subject":"${subject}"`),
    );
    if (!notices.length) continue;
    const observedAfter = Math.max(
      ...notices.map((issue) =>
        Date.parse(issue.updated_at ?? issue.created_at ?? ""),
      ),
    );
    const recovered = subject.startsWith("refresh:")
      ? (state.local.sources ?? []).some((source) => {
          if (
            source.status !== "active" ||
            source.refresh_policy !== "automatic" ||
            source.type !== subject.slice(8)
          )
            return false;
          const snapshot = (state.local.snapshots ?? []).find(
            (value) => value.source_id === source.id,
          );
          const observedAt = Date.parse(snapshot?.refreshed_at ?? "");
          return (
            snapshot?.source_health === "healthy" &&
            snapshot.stale_since === null &&
            snapshot.repository?.id === source.repository_id &&
            observedAt > observedAfter &&
            observedAt <= state.nowMs + 300_000
          );
        })
      : subject === "dependency:publisher"
        ? state.receipts.some(
            (receipt) =>
              receipt.operation.stage === "finalized" &&
              [
                "project",
                "owner-request",
                "kit",
                "withdrawal",
                "refresh",
                "metadata",
                "advisory",
                "report-import",
                "deployment",
              ].includes(receipt.operation.identity.kind) &&
              Date.parse(receipt.completedAt ?? "") > observedAfter,
          )
        : budget?.tickets.some(
            (ticket) =>
              ticket.settled &&
              ticket.usage?.requests > 0 &&
              Date.parse(ticket.createdAt) > observedAfter,
          );
    if (recovered)
      circuits.set(subject, {
        subject,
        reason: "verified-recovery",
        recovered: true,
      });
  }
  const latest = state.local.publishableRevision;
  const active = state.local.activeDeployment;
  const observations = (state.local.sources ?? [])
    .filter(
      (source) =>
        source.status === "active" &&
        source.refresh_policy === "automatic" &&
        ["github", "codeberg"].includes(source.type),
    )
    .map((source) => {
      const snapshot = (state.local.snapshots ?? []).find(
        (value) => value.source_id === source.id,
      );
      return {
        provider: source.type,
        required: true,
        refreshedAt: snapshot?.refreshed_at,
        healthy:
          snapshot?.source_health === "healthy" &&
          snapshot.stale_since === null,
      };
    });
  const imports = state.local.reportIndex
    ? operations
        .filter(
          (operation) =>
            operation.identity.kind === "report-import" &&
            !operation.identity.subject.startsWith("report:narrative:"),
        )
        .map((operation) => ({
          key: operation.key,
          dueAt: operation.createdAt,
          completed: [
            "published",
            "deployment-requested",
            "deployment-confirmed",
            "finalized",
          ].includes(operation.stage),
        }))
    : [];
  const dependencies = state.remote.pulls
    .filter(
      (pull) =>
        pull.state === "open" &&
        pull.user?.id === 49699333 &&
        pull.user.type === "Bot" &&
        pull.head?.repo?.full_name === state.repository &&
        pull.base?.repo?.full_name === state.repository &&
        pull.base.ref === "main",
    )
    .flatMap((pull) => {
      const run = state.remote.runs
        .filter(
          (run) =>
            run.path === ".github/workflows/ci.yml" &&
            ["pull_request", "workflow_dispatch"].includes(run.event) &&
            run.head_sha === pull.head.sha &&
            run.head_repository?.full_name === state.repository,
        )
        .sort((left, right) => right.id - left.id)[0];
      if (run?.status !== "completed" || !run.conclusion) return [];
      return [
        {
          number: pull.number,
          headSha: pull.head.sha,
          failed: run.conclusion !== "success",
          recovered: run.conclusion === "success",
        },
      ];
    });
  const day = budget?.days.find(
    (value) => value.day === new Date(state.nowMs).toISOString().slice(0, 10),
  );
  return assessAutomationHealth({
    nowMs: state.nowMs,
    operations,
    refreshState: observations,
    importState: imports,
    ...(latest
      ? {
          deploymentState: {
            latestRevision: latest,
            activeRevision: active?.deployment.sourceSha,
            pendingSince: state.local.publishableCommittedAt,
            ordinary: !active || active.mode === "ordinary",
          },
        }
      : {}),
    circuits: [...circuits.values()],
    dependencies,
    ...(budget ||
    failures.some(
      (operation) => operation.retry.failure.reasonCode === "budget-exhausted",
    )
      ? {
          budget: {
            exhausted:
              Boolean(day && (day.requests >= 40 || day.tokens >= 200_000)) ||
              failures.some(
                (operation) =>
                  operation.retry.failure.reasonCode === "budget-exhausted",
              ),
          },
        }
      : {}),
  });
}

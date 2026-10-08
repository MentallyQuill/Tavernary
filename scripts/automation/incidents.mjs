import { isDeepStrictEqual } from "node:util";
import { HEALTH_TITLES, validateHealthFinding } from "./health.mjs";
import { assertCanonicalWriterContext } from "./github-inventory.mjs";
import { executeGh } from "../submissions/kit-submission-reconciliation.mjs";

function body(finding) {
  const evidence = {
    key: finding.key,
    code: finding.code,
    subject: finding.subject,
    status: "active",
    reason: finding.reason,
    count: finding.count,
    ...(finding.revision ? { revision: finding.revision } : {}),
  };
  return `<!-- tavernary-automation-incident:v1:${finding.key} -->\n\n${HEALTH_TITLES[finding.code]}. Inspect the corresponding Actions run and repair the reported dependency or operation. Catalog processing continues independently.\n\nSubject: \`${finding.subject}\`\nReason: \`${finding.reason}\`\nAffected: ${finding.count}\n\n<!-- evidence:${JSON.stringify(evidence)} -->`;
}
function intact(issue, key) {
  if (typeof issue.body !== "string" || Buffer.byteLength(issue.body) > 16_384)
    return false;
  const match = /<!-- evidence:(\{[^\n]*\}) -->$/u.exec(issue.body);
  try {
    const evidence = validateHealthFinding(JSON.parse(match?.[1] ?? "null"));
    return (
      evidence.key === key &&
      issue.body === body(evidence) &&
      issue.title === `[automation] ${HEALTH_TITLES[evidence.code]}`
    );
  } catch {
    return false;
  }
}
function owned(issue, publisherActorId) {
  return (
    Number.isSafeInteger(issue.number) &&
    issue.number > 0 &&
    !issue.pull_request &&
    issue.user?.id === publisherActorId &&
    issue.user.type === "Bot"
  );
}

export function planIncidentUpdates({
  findings,
  existingIssues,
  publisherActorId,
}) {
  if (
    !Number.isSafeInteger(publisherActorId) ||
    publisherActorId < 1 ||
    !Array.isArray(findings) ||
    findings.length > 100_000 ||
    !Array.isArray(existingIssues) ||
    existingIssues.length > 100_000
  )
    throw new Error("Automation incident inventory is invalid.");
  const seen = new Set(),
    mutations = [];
  for (const finding of findings) {
    validateHealthFinding(finding);
    if (seen.has(finding.key))
      throw new Error("Automation health finding is duplicated.");
    seen.add(finding.key);
    const marker = `<!-- tavernary-automation-incident:v1:${finding.key} -->`;
    const matches = existingIssues
      .filter(
        (issue) =>
          owned(issue, publisherActorId) &&
          typeof issue.body === "string" &&
          issue.body.startsWith(marker),
      )
      .sort((left, right) => left.number - right.number);
    const issue = matches[0];
    if (
      issue &&
      (!intact(issue, finding.key) || issue.state_reason === "not_planned")
    )
      continue;
    if (finding.status === "recovered") {
      if (issue?.state === "open")
        mutations.push({
          action: "close",
          number: issue.number,
          key: finding.key,
          title: issue.title,
          body: issue.body,
        });
      continue;
    }
    const title = `[automation] ${HEALTH_TITLES[finding.code]}`,
      rendered = body(finding);
    if (!issue)
      mutations.push({
        action: "create",
        key: finding.key,
        title,
        body: rendered,
      });
    else if (issue.state === "closed") {
      if (
        !issue.closed_by ||
        (issue.closed_by.id === publisherActorId &&
          issue.closed_by.type === "Bot")
      )
        mutations.push({
          action: "reopen",
          number: issue.number,
          key: finding.key,
          title,
          body: rendered,
        });
    } else if (
      issue.state === "open" &&
      (issue.body !== rendered || issue.title !== title)
    )
      mutations.push({
        action: "update",
        number: issue.number,
        key: finding.key,
        title,
        body: rendered,
      });
  }
  return mutations.sort((left, right) => {
    const order = { create: 0, close: 1, reopen: 2, update: 3 };
    return (
      order[left.action] - order[right.action] ||
      (left.number ?? Number.MAX_SAFE_INTEGER) -
        (right.number ?? Number.MAX_SAFE_INTEGER) ||
      left.key.localeCompare(right.key)
    );
  });
}

export async function reconcileIncidentUpdates({
  env = process.env,
  gh = executeGh,
  load,
  availableSlots = 1,
}) {
  assertCanonicalWriterContext(env, env.GITHUB_REPOSITORY);
  if (
    !Number.isSafeInteger(availableSlots) ||
    availableSlots < 0 ||
    availableSlots > 20
  )
    throw new Error("Automation incident allowance is invalid.");
  if (!availableSlots) return { status: "waiting", reason: "operation-limit" };
  const initial = await load();
  const mutation = planIncidentUpdates(initial)[0];
  if (!mutation) return { status: "idle" };
  const fresh = await load();
  if (
    fresh.publisherActorId !== initial.publisherActorId ||
    !isDeepStrictEqual(planIncidentUpdates(fresh)[0], mutation)
  )
    return { status: "superseded" };
  const api = async (path, method, payload) => {
    const output = await gh(
      [
        "api",
        `repos/${env.GITHUB_REPOSITORY}/${path}`,
        ...(method ? ["--method", method] : []),
        ...(payload ? ["--input", "-"] : []),
      ],
      payload ? JSON.stringify(payload) : undefined,
    );
    if (Buffer.byteLength(output) > 2_097_152)
      throw new Error("Automation incident response exceeds its bound.");
    return JSON.parse(output);
  };
  if (mutation.number) {
    const expected = fresh.existingIssues.find(
      (issue) => issue.number === mutation.number,
    );
    const current = await api(`issues/${mutation.number}`);
    if (
      !owned(current, fresh.publisherActorId) ||
      !intact(current, mutation.key) ||
      !["body", "title", "state", "state_reason"].every(
        (field) => current[field] === expected[field],
      ) ||
      current.state_reason === "not_planned"
    )
      return { status: "superseded" };
    if (
      mutation.action === "reopen" &&
      (current.closed_by?.id !== fresh.publisherActorId ||
        current.closed_by.type !== "Bot")
    )
      return { status: "superseded" };
  }
  const payload =
    mutation.action === "close"
      ? { state: "closed", state_reason: "completed" }
      : {
          title: mutation.title,
          body: mutation.body,
          ...(mutation.action === "reopen" ? { state: "open" } : {}),
        };
  const response =
    mutation.action === "create"
      ? await api("issues", "POST", payload)
      : await api(`issues/${mutation.number}`, "PATCH", payload);
  if (
    !owned(response, fresh.publisherActorId) ||
    !intact(response, mutation.key) ||
    response.body !== mutation.body ||
    (mutation.number && response.number !== mutation.number) ||
    response.state !== (mutation.action === "close" ? "closed" : "open")
  )
    throw new Error("Automation incident mutation is unconfirmed.");
  return {
    status: mutation.action === "close" ? "closed" : "updated",
    number: response.number,
  };
}

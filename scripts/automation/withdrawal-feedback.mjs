import { processKitWithdrawal } from "../kits/apply-withdrawal.mjs";
import { executeGh } from "../submissions/kit-submission-reconciliation.mjs";

const marker = "<!-- tavernary-kit-withdrawal-correction -->";
function issueIdentity(issue) {
  return JSON.stringify([
    issue.number,
    issue.state,
    issue.body,
    issue.user?.id,
    issue.user?.type,
    Boolean(issue.pull_request),
    (issue.labels ?? [])
      .map((label) => (typeof label === "string" ? label : label.name))
      .filter((label) =>
        [
          "kit-withdrawal",
          "submission-declined",
          "issue-limit-reached",
        ].includes(label),
      )
      .sort(),
  ]);
}

export async function synchronizeWithdrawalFeedback({
  state,
  issueNumber,
  gh = executeGh,
}) {
  if (state.local.revision !== state.remote.mainHeadSha)
    throw new Error("Withdrawal feedback requires current canonical data.");
  const issue = state.remote.issues.find(
    (issue) => issue.number === issueNumber && !issue.pull_request,
  );
  if (!issue || issue.state !== "open") return;
  const path = `repos/${state.repository}/issues/${issueNumber}`;
  async function assertCurrent() {
    const fresh = JSON.parse(await gh(["api", "--method", "GET", path]));
    if (issueIdentity(fresh) !== issueIdentity(issue))
      throw new Error("Withdrawal input changed before feedback.");
  }
  await assertCurrent();
  const result = await processKitWithdrawal({
    issue,
    loadKit: async (id) => state.local.kits.find((kit) => kit.id === id),
    writeKit: async () => {},
    now: new Date(state.nowMs ?? Date.now()).toISOString(),
  });
  const pages = JSON.parse(
    await gh([
      "api",
      "--method",
      "GET",
      "--paginate",
      "--slurp",
      `${path}/comments`,
      "-f",
      "per_page=100",
    ]),
  );
  const owned = pages
    .flat()
    .filter(
      (comment) =>
        comment.user?.id === 41898282 &&
        comment.user.login === "github-actions[bot]" &&
        comment.user.type === "Bot" &&
        String(comment.body ?? "").startsWith(marker),
    );
  async function mutate(method, target) {
    await assertCurrent();
    return gh(["api", "--method", method, target]);
  }
  // Field encoding passes review text as an argument without shell interpolation.
  async function fields(method, target, values) {
    await assertCurrent();
    return gh([
      "api",
      "--method",
      method,
      target,
      ...Object.entries(values).flatMap(([key, value]) => [
        "-f",
        `${key}=${value}`,
      ]),
    ]);
  }
  if (result.status === "needs-information") {
    try {
      await fields("POST", `repos/${state.repository}/labels`, {
        name: "needs-information",
        color: "d93f0b",
        description: "Submission needs corrected public information.",
      });
    } catch (error) {
      if (!/\bHTTP 422\b/u.test(error?.message ?? "") && error?.status !== 422)
        throw error;
    }
    await fields("POST", `${path}/labels`, { "labels[]": "needs-information" });
    const body = [
      marker,
      "Tavernary could not apply this Kit withdrawal.",
      "",
      "Readable GitHub fields are review-only and are not the automation payload.",
      `Return to ${result.returnUrl}, correct the request, and open a new GitHub review. This issue will remain open with \`needs-information\`.`,
    ].join("\n");
    const current = owned.shift();
    if (current?.body !== body)
      await fields(
        current ? "PATCH" : "POST",
        current
          ? `repos/${state.repository}/issues/comments/${current.id}`
          : `${path}/comments`,
        { body },
      );
  } else {
    try {
      await mutate("DELETE", `${path}/labels/needs-information`);
    } catch (error) {
      if (!/\bHTTP 404\b/u.test(error?.message ?? "") && error?.status !== 404)
        throw error;
    }
  }
  for (const comment of owned)
    await mutate(
      "DELETE",
      `repos/${state.repository}/issues/comments/${comment.id}`,
    );
}

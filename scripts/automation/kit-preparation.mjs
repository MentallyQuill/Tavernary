import { format } from "prettier";
import { createPreparedKitRecord } from "./kit-publication-context.mjs";
import { refreshKitReactions } from "../kits/refresh-reactions.mjs";
import { executeGh } from "../submissions/kit-submission-reconciliation.mjs";
import { githubFailureStatus } from "./github-inventory.mjs";

export async function acquirePreparedKitData({
  state,
  operation,
  gh = executeGh,
}) {
  const kit = createPreparedKitRecord({ state, operation });
  const now = new Date(state.nowMs).toISOString();
  let snapshots;
  try {
    snapshots = await refreshKitReactions({
      kits: [kit],
      snapshots: state.local.kitSnapshots.filter(
        (snapshot) => snapshot.kit_id === kit.id,
      ),
      blockedUsers: state.local.blockedUsers,
      now,
      ...(operation.identity.kind === "kit" ? { requiredKitId: kit.id } : {}),
      fetchPage: async ({ kit, page, perPage }) => {
        const values = JSON.parse(
          await gh([
            "api",
            `repos/${state.repository}/issues/${kit.source_issue_number}/reactions?per_page=${perPage}&page=${page}`,
          ]),
        );
        if (!Array.isArray(values) || values.length > perPage)
          throw new Error("Kit reaction response is invalid.");
        return values;
      },
    });
  } catch (error) {
    const status = githubFailureStatus(error.cause ?? error);
    if (Number.isInteger(status))
      throw Object.assign(
        new Error("Kit support observation is unavailable."),
        { status },
      );
    throw error;
  }
  const outputs = {
    [`data/registry/kits/${kit.id}.json`]: await format(JSON.stringify(kit), {
      parser: "json",
    }),
  };
  for (const snapshot of snapshots)
    outputs[`data/snapshots/github/kits/${snapshot.kit_id}.json`] =
      await format(JSON.stringify(snapshot), { parser: "json" });
  return outputs;
}

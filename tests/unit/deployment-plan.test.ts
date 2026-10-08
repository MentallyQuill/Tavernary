import { expect, test } from "vitest";
import {
  planDeployment,
  readPreviousManifest,
} from "../../scripts/automation/deployment-plan.mjs";
import { deploymentFixture } from "../helpers/deployment-fixtures";

test("an older ordinary request cannot replace a descendant", () => {
  expect(
    planDeployment(
      deploymentFixture({
        requestedSha: "a".repeat(40),
        validatedSha: "a".repeat(40),
      }),
    ).action,
  ).toBe("superseded");
});
test("a verified duplicate coalesces without another deployment", () => {
  expect(
    planDeployment(deploymentFixture({ deployedSha: "c".repeat(40) })).action,
  ).toBe("coalesced");
});
test("fresh main advancement supersedes a queued build", () => {
  expect(
    planDeployment(deploymentFixture({ currentMainSha: "d".repeat(40) })),
  ).toMatchObject({ action: "superseded", targetSha: "d".repeat(40) });
});
test("bookkeeping commits preserve the latest publishable ancestor", () => {
  expect(
    planDeployment(
      deploymentFixture({
        currentMainSha: "d".repeat(40),
        latestPublishableSha: "c".repeat(40),
      }),
    ).action,
  ).toBe("deploy");
});
test.each([null, false])(
  "unknown or diverged deployed ancestry fails closed (%s)",
  (relation) => {
    expect(
      planDeployment(deploymentFixture({ isAncestor: () => relation })).action,
    ).toBe("reject");
  },
);
test("a forged artifact source cannot be published", () => {
  expect(
    planDeployment(deploymentFixture({ validatedSha: "a".repeat(40) })),
  ).toMatchObject({ action: "reject", reason: "artifact-source-mismatch" });
});
test("rollback requires a bounded explicit reason", () => {
  const input = deploymentFixture({
    requestedSha: "a".repeat(40),
    validatedSha: "a".repeat(40),
    mode: "rollback",
  });
  expect(planDeployment(input).action).toBe("reject");
  expect(
    planDeployment({
      ...input,
      authorizedRollbackReason: "Restore after asset corruption",
    }).action,
  ).toBe("deploy");
});
test.each(["missing", "timeout", "invalid"])(
  "the previous hosted manifest is advisory during %s",
  async (reason) => {
    expect(
      await readPreviousManifest(async () => {
        throw new Error(reason);
      }),
    ).toEqual({ status: "unavailable" });
    expect(
      planDeployment(deploymentFixture({ deployedSha: null })).action,
    ).toBe("deploy");
  },
);

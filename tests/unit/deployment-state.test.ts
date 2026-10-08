import { expect, test } from "vitest";
import {
  createActiveDeployment,
  validateActiveDeployment,
  activeRollbackCoversMain,
} from "../../scripts/automation/deployment-state.mjs";
import { confirmationFixture } from "../helpers/confirmation-fixtures";
import { confirmDeployment } from "../../scripts/automation/confirm-deployment.mjs";
async function fixture() {
  const site = confirmationFixture();
  const result = await confirmDeployment(site.input);
  if (result.status !== "confirmed") throw new Error("Invalid fixture");
  return { site, deployment: { ...result.deployment, workflowRunId: 42 } };
}
test("explicit rollback proof binds owner authorization, the current public baseline, and exact verified assets", async () => {
  const data = await fixture();
  const active = createActiveDeployment({
    deployment: data.deployment,
    confirmingRunId: 88,
    nowMs: data.site.input.nowMs,
    mode: "rollback",
    rollbackBaselineSha: "d".repeat(40),
    rollbackReason: "Restore working presentation",
    ownerActorId: 2625904,
  });
  expect(
    validateActiveDeployment(active, { nowMs: data.site.input.nowMs }),
  ).toEqual(active);
  expect(
    activeRollbackCoversMain({
      active,
      latestPublishableSha: "d".repeat(40),
      catalogDigest: data.deployment.confirmation.catalogDigest,
      targetDigest: data.deployment.confirmation.targetDigest,
      nowMs: data.site.input.nowMs,
    }),
  ).toBe(true);
  expect(
    activeRollbackCoversMain({
      active,
      latestPublishableSha: "e".repeat(40),
      catalogDigest: data.deployment.confirmation.catalogDigest,
      targetDigest: data.deployment.confirmation.targetDigest,
      nowMs: data.site.input.nowMs,
    }),
  ).toBe(false);
});
test("ordinary confirmation cannot manufacture an owner rollback override", async () => {
  const data = await fixture();
  expect(() =>
    createActiveDeployment({
      deployment: data.deployment,
      confirmingRunId: 88,
      nowMs: data.site.input.nowMs,
      mode: "ordinary",
      rollbackBaselineSha: "d".repeat(40),
      rollbackReason: "foreign",
      ownerActorId: 2625904,
    }),
  ).toThrow();
  expect(() =>
    createActiveDeployment({
      deployment: data.deployment,
      confirmingRunId: 88,
      nowMs: data.site.input.nowMs,
      mode: "rollback",
      rollbackBaselineSha: "d".repeat(40),
      rollbackReason: "Restore",
      ownerActorId: 4624827,
    }),
  ).toThrow();
});

import { expect, test } from "vitest";
import { planRollback } from "../../scripts/automation/rollback.mjs";
import {
  encodeSiteBundle,
  decodeSiteBundle,
} from "../../scripts/automation/site-bundle.mjs";
import { bundleFixture } from "../helpers/site-bundle-fixtures";
function input() {
  const target = decodeSiteBundle(encodeSiteBundle(bundleFixture()));
  return {
    target,
    currentCatalogDigest: target.manifest.catalogDigest,
    currentTargetsDigest: target.manifest.targetDigest,
    ownerTombstones: [] as string[],
    authorizedReason: "Restore verified build after broken deployment",
  };
}
test("an explicitly authorized matching bundle can restore current data", () => {
  expect(planRollback(input())).toMatchObject({
    action: "deploy",
    sourceSha: "c".repeat(40),
  });
});
test("rollback cannot resurrect a newly delisted source or a withdrawn Kit", () => {
  for (const key of ["github-42", "project-42", "kit-42"]) {
    const data = input();
    data.target.listedSourceIds = ["github-42"];
    data.target.listedProjectIds = ["project-42"];
    data.target.listedKitIds = ["kit-42"];
    data.ownerTombstones = [key];
    expect(planRollback(data)).toMatchObject({
      action: "reject",
      reason: "owner-removal-conflict",
    });
  }
});
test.each(["catalog", "targets", "reason", "invalid"])(
  "incompatible %s rollback records an owner decision without authorizing deployment",
  (variant) => {
    const data = input();
    if (variant === "catalog") data.currentCatalogDigest = "f".repeat(64);
    if (variant === "targets") data.currentTargetsDigest = "f".repeat(64);
    if (variant === "reason") data.authorizedReason = "";
    if (variant === "invalid") data.currentCatalogDigest = "unknown";
    expect(planRollback(data)).toHaveProperty("action", "reject");
  },
);

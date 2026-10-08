import { validateRevisionManifest } from "./revision-manifest.mjs";
export function planRollback({
  target,
  currentCatalogDigest,
  currentTargetsDigest,
  ownerTombstones,
  authorizedReason,
}) {
  const reject = (reason) => ({
    action: "reject",
    reason,
    ownerDecisionRequired: true,
  });
  try {
    validateRevisionManifest(target?.manifest);
  } catch {
    return reject("invalid-bundle");
  }
  if (
    ![currentCatalogDigest, currentTargetsDigest].every((value) =>
      /^[a-f0-9]{64}$/u.test(value ?? ""),
    ) ||
    !Array.isArray(ownerTombstones) ||
    ownerTombstones.length > 100000 ||
    ownerTombstones.some(
      (value) =>
        typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value),
    ) ||
    ![
      target.listedSourceIds,
      target.listedProjectIds,
      target.listedKitIds,
    ].every(
      (value) =>
        Array.isArray(value) &&
        value.every(
          (id) =>
            typeof id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id),
        ),
    )
  )
    return reject("invalid-current-data");
  const listed = new Set([
    ...target.listedSourceIds,
    ...target.listedProjectIds,
    ...target.listedKitIds,
  ]);
  if (ownerTombstones.some((id) => listed.has(id)))
    return reject("owner-removal-conflict");
  if (
    target.manifest.catalogDigest !== currentCatalogDigest ||
    target.manifest.targetDigest !== currentTargetsDigest
  )
    return reject("canonical-data-changed");
  if (
    typeof authorizedReason !== "string" ||
    !authorizedReason.trim() ||
    authorizedReason.length > 500 ||
    /[\u0000-\u001f\u007f]/u.test(authorizedReason)
  )
    return reject("rollback-authorization-required");
  return {
    action: "deploy",
    mode: "rollback",
    sourceSha: target.manifest.sourceSha,
    buildId: target.manifest.buildId,
    archiveDigest: target.archiveDigest,
    reason: authorizedReason.trim(),
  };
}

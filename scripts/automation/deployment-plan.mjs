const sha = /^[a-f0-9]{40}$/u;

export function planDeployment({
  requestedSha,
  currentMainSha,
  deployedSha,
  validatedSha,
  isAncestor,
  mode,
  authorizedRollbackReason,
  latestPublishableSha = currentMainSha,
}) {
  const reject = (reason) => ({ action: "reject", reason });
  if (
    ![requestedSha, currentMainSha, validatedSha, latestPublishableSha].every(
      (value) => sha.test(value ?? ""),
    ) ||
    (deployedSha !== null && !sha.test(deployedSha ?? ""))
  )
    return reject("invalid-revision");
  if (validatedSha !== requestedSha) return reject("artifact-source-mismatch");
  const ancestor = (a, b) => a === b || isAncestor(a, b) === true;
  if (
    !ancestor(requestedSha, currentMainSha) ||
    !ancestor(latestPublishableSha, currentMainSha)
  )
    return reject("unknown-main-ancestry");
  if (mode === "rollback") {
    if (
      typeof authorizedRollbackReason !== "string" ||
      !authorizedRollbackReason.trim() ||
      authorizedRollbackReason.length > 500 ||
      /[\u0000-\u001f]/u.test(authorizedRollbackReason)
    )
      return reject("rollback-authorization-required");
    return { action: "deploy", sourceSha: requestedSha, mode };
  }
  if (mode !== "ordinary") return reject("invalid-mode");
  if (deployedSha === requestedSha)
    return { action: "coalesced", sourceSha: requestedSha };
  if (deployedSha !== null) {
    if (!ancestor(deployedSha, currentMainSha))
      return reject("unknown-deployment-ancestry");
    if (ancestor(requestedSha, deployedSha))
      return { action: "superseded", targetSha: latestPublishableSha };
    if (!ancestor(deployedSha, requestedSha))
      return reject("unknown-deployment-ancestry");
  }
  if (requestedSha !== latestPublishableSha)
    return { action: "superseded", targetSha: latestPublishableSha };
  return { action: "deploy", sourceSha: requestedSha, mode };
}

// Hosted state can help diagnostics; it cannot authorize or block recovery.
export async function readPreviousManifest(read) {
  try {
    return { status: "available", value: await read() };
  } catch {
    return { status: "unavailable" };
  }
}

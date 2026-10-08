export function planSiteBundleRetention({
  bundles,
  nowMs,
  protectedBundleIds = [],
}) {
  const fail = () => {
    throw new Error("Verified site-bundle retention inventory is invalid.");
  };
  if (
    !Number.isSafeInteger(nowMs) ||
    nowMs < 0 ||
    !Array.isArray(bundles) ||
    bundles.length > 1000 ||
    !Array.isArray(protectedBundleIds) ||
    protectedBundleIds.length > 1000 ||
    protectedBundleIds.some((id) => !Number.isSafeInteger(id) || id < 1)
  )
    fail();
  const ids = new Set();
  for (const bundle of bundles) {
    const time = Date.parse(bundle.confirmedAt);
    if (
      !Number.isSafeInteger(bundle.id) ||
      bundle.id < 1 ||
      ids.has(bundle.id) ||
      !Number.isSafeInteger(bundle.runId) ||
      bundle.runId < 1 ||
      !/^[a-f0-9]{40}$/u.test(bundle.sourceSha ?? "") ||
      !/^run-[1-9]\d*-attempt-[1-9]\d*$/u.test(bundle.buildId ?? "") ||
      !/^sha256:[a-f0-9]{64}$/u.test(bundle.archiveDigest ?? "") ||
      !Number.isFinite(time) ||
      new Date(time).toISOString() !== bundle.confirmedAt ||
      time > nowMs + 300000
    )
      fail();
    ids.add(bundle.id);
  }
  if (protectedBundleIds.some((id) => !ids.has(id))) fail();
  const sorted = [...bundles].sort(
      (a, b) =>
        Date.parse(b.confirmedAt) - Date.parse(a.confirmedAt) || b.id - a.id,
    ),
    keep = new Set([
      ...protectedBundleIds,
      ...sorted.slice(0, 3).map((bundle) => bundle.id),
    ]);
  const current = new Date(nowMs),
    months = new Set(
      Array.from({ length: 12 }, (_, index) =>
        new Date(
          Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - index, 1),
        )
          .toISOString()
          .slice(0, 7),
      ),
    );
  for (const bundle of sorted) {
    const month = bundle.confirmedAt.slice(0, 7);
    if (months.delete(month)) keep.add(bundle.id);
  }
  return {
    keepIds: [...keep].sort((a, b) => a - b),
    removeIds: bundles
      .filter((bundle) => !keep.has(bundle.id))
      .map((bundle) => bundle.id)
      .sort((a, b) => a - b),
  };
}

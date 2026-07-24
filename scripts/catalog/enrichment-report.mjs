export function createEnrichmentReport(generatedAt, result) {
  const ids = [
    ...result.enriched,
    ...result.fallback,
    ...result.skipped,
    ...result.failed.map((entry) => entry.id),
  ];
  if (new Set(ids).size !== ids.length) {
    throw new Error("enrichment report contains duplicate project IDs");
  }
  const enriched = [...new Set(result.enriched)].sort();
  const fallback = [...new Set(result.fallback)].sort();
  const skipped = [...new Set(result.skipped)].sort();
  const failed = [...result.failed].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  return {
    generated_at: generatedAt,
    selected:
      enriched.length + fallback.length + skipped.length + failed.length,
    enriched,
    fallback,
    skipped,
    failed,
  };
}

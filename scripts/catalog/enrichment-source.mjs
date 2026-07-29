import { parseSourceIdentity } from "../submissions/source-identity.mjs";
import { loadReadmeSource } from "./readme-source.mjs";
import { loadRedditEnrichmentSource } from "./reddit-enrichment-source.mjs";

export async function loadEnrichmentSource(
  project,
  sourceRecord,
  snapshot,
  options = {},
) {
  if (sourceRecord?.type === "github" || sourceRecord?.type === "codeberg") {
    const source = await (options.loadRepository ?? loadReadmeSource)(
      sourceRecord,
      snapshot,
      options,
    );
    return {
      ...source,
      sourceIdentity: `${sourceRecord.type}:${sourceRecord.repository.toLowerCase()}`,
    };
  }

  if (sourceRecord?.type === "url") {
    let identity;
    try {
      identity = parseSourceIdentity(sourceRecord.url);
    } catch {
      identity = null;
    }
    if (identity?.kind === "reddit") {
      return (options.loadReddit ?? loadRedditEnrichmentSource)(
        sourceRecord,
        options,
      );
    }
  }

  return {
    status: "failed",
    reasonCode: "unsupported-enrichment-source",
    message: "No automatic enrichment adapter supports this source.",
  };
}

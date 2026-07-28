import { parseSourceIdentity } from "../submissions/source-identity.mjs";
import { loadReadmeSource } from "./readme-source.mjs";
import { loadRedditEnrichmentSource } from "./reddit-enrichment-source.mjs";

export async function loadEnrichmentSource(record, snapshot, options = {}) {
  if (record.source?.type === "github" || record.source?.type === "codeberg") {
    const source = await (options.loadRepository ?? loadReadmeSource)(
      record,
      snapshot,
      options,
    );
    return {
      ...source,
      sourceIdentity: `${record.source.type}:${record.source.repository.toLowerCase()}`,
    };
  }

  if (record.source?.type === "url") {
    let identity;
    try {
      identity = parseSourceIdentity(record.source.url);
    } catch {
      identity = null;
    }
    if (identity?.kind === "reddit") {
      return (options.loadReddit ?? loadRedditEnrichmentSource)(
        record,
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

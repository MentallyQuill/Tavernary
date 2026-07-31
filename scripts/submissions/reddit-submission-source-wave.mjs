import { loadEnrichmentSource } from "../catalog/enrichment-source.mjs";

export const REDDIT_SOURCE_BACKOFF_MS = Object.freeze([30_000, 60_000]);

const integrityFailures = new Set([
  "unsupported-enrichment-source",
  "reddit-identity-mismatch",
]);

export function redditSourceFailureClass(reasonCode) {
  return integrityFailures.has(reasonCode) ? "integrity" : "availability";
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function loadRedditSubmissionSourceWave({
  project,
  source,
  snapshot = null,
  loadSource = loadEnrichmentSource,
  sleep = delay,
}) {
  let failure;
  for (let index = 0; index < 3; index += 1) {
    try {
      const result = await loadSource(project, source, snapshot);
      if (result?.status === "ready") {
        return { status: "ready", source: result, attempts: index + 1 };
      }
      failure =
        result?.status === "failed" &&
        typeof result.reasonCode === "string" &&
        typeof result.message === "string"
          ? result
          : {
              status: "failed",
              reasonCode: "reddit-response-invalid",
              message: "The Reddit source response is invalid.",
            };
    } catch {
      failure = {
        status: "failed",
        reasonCode: "reddit-fetch-failed",
        message: "The Reddit source request failed.",
      };
    }
    if (redditSourceFailureClass(failure?.reasonCode) === "integrity") {
      return { status: "blocked", failure, attempts: index + 1 };
    }
    if (index < REDDIT_SOURCE_BACKOFF_MS.length) {
      await sleep(REDDIT_SOURCE_BACKOFF_MS[index]);
    }
  }
  return { status: "exhausted", failure, attempts: 3 };
}

import { CATALOG_POLICY_VERSION } from "../../src/features/catalog/catalog-policy.mjs";
import { validateCatalogCopyResult } from "./catalog-copy-contract.mjs";
import { createCatalogCopyProvider } from "./catalog-copy-provider.mjs";

const trustedAuthorities = new Set(["repository-owner", "tavernary-staff"]);

async function defaultCopySummary(input) {
  const provider = createCatalogCopyProvider({
    apiUrl: process.env.TAVERNARY_ENRICHMENT_API_URL,
    apiKey: process.env.TAVERNARY_ENRICHMENT_API_KEY,
    model: process.env.TAVERNARY_ENRICHMENT_MODEL,
  });
  const generated = await provider.generate({
    mode: "preserve",
    submittedSummary: input.submittedSummary,
    evidence: {
      readme: null,
      repositoryDescription: null,
      submissionDescription: input.submittedSummary,
    },
    protectedTerms: input.protectedTerms,
    policyVersion: input.policyVersion,
    ...(input.repair ? { repair: input.repair } : {}),
  });
  return generated.output;
}

export async function preserveCatalogSummary(input) {
  if (!trustedAuthorities.has(input?.authorityType)) {
    const error = new Error(
      "Catalog summary preservation requires verified owner or staff authority.",
    );
    error.code = "catalog-copy-authority-invalid";
    throw error;
  }
  if (
    typeof input?.submittedSummary !== "string" ||
    input.submittedSummary.length < 1 ||
    input.submittedSummary.length > 220
  ) {
    const error = new Error(
      "Catalog summary preservation requires one to 220 characters.",
    );
    error.code = "catalog-copy-input-invalid";
    throw error;
  }
  const request = {
    authorityType: input.authorityType,
    submittedSummary: input.submittedSummary,
    protectedTerms: [
      ...new Set(
        (input.protectedTerms ?? []).filter(
          (term) => typeof term === "string" && term.length > 0,
        ),
      ),
    ],
    policyVersion: input.policyVersion ?? CATALOG_POLICY_VERSION,
  };
  const copySummary = input.copySummary ?? defaultCopySummary;
  let output = await copySummary(request);
  let validation = validateCatalogCopyResult(output, {
    mode: "preserve",
    submittedSummary: request.submittedSummary,
    protectedTerms: request.protectedTerms,
  });
  if (!validation.valid) {
    output = await copySummary({
      ...request,
      repair: {
        reasonCode: "output-invalid",
        message: validation.repairHint,
      },
    });
    validation = validateCatalogCopyResult(output, {
      mode: "preserve",
      submittedSummary: request.submittedSummary,
      protectedTerms: request.protectedTerms,
    });
  }
  if (!validation.valid) {
    const error = new Error(validation.repairHint);
    error.code = "catalog-copy-invalid";
    throw error;
  }
  return {
    mode: "preserve",
    submittedSummary: request.submittedSummary,
    publishedSummary: output.summary,
    copyResult: {
      result: output.result,
      change_reasons: [...output.change_reasons],
      policy_signal: output.policy_signal,
    },
  };
}

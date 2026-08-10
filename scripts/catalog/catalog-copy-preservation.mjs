import { CATALOG_POLICY_VERSION } from "../../src/features/catalog/catalog-policy.mjs";
import { validateCatalogCopyResult } from "./catalog-copy-contract.mjs";
import {
  invalidOutputCopyReviewDiagnostic,
  providerCopyReviewDiagnostic,
} from "./catalog-copy-diagnostic.mjs";
import { createCatalogCopyProvider } from "./catalog-copy-provider.mjs";
import { modelProviderOptionsFromEnvironment } from "./model-provider-configuration.mjs";

const trustedAuthorities = new Set(["repository-owner", "tavernary-staff"]);

function unavailableCopyReview(submittedSummary, diagnostic) {
  return {
    mode: "preserve",
    reviewStatus: "unavailable",
    reasonCode: "copy-review-unavailable",
    submittedSummary,
    publishedSummary: submittedSummary,
    copyResult: null,
    diagnostic,
  };
}

async function defaultCopySummary(input) {
  const provider = createCatalogCopyProvider({
    ...modelProviderOptionsFromEnvironment(),
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
  let output;
  try {
    output = await copySummary(request);
  } catch (error) {
    return unavailableCopyReview(
      request.submittedSummary,
      providerCopyReviewDiagnostic(error, "initial-provider", 1),
    );
  }
  let validation = validateCatalogCopyResult(output, {
    mode: "preserve",
    submittedSummary: request.submittedSummary,
    protectedTerms: request.protectedTerms,
  });
  if (!validation.valid) {
    try {
      output = await copySummary({
        ...request,
        repair: {
          reasonCode: "output-invalid",
          message: validation.repairHint,
        },
      });
    } catch (error) {
      return unavailableCopyReview(
        request.submittedSummary,
        providerCopyReviewDiagnostic(error, "repair-provider", 2),
      );
    }
    validation = validateCatalogCopyResult(output, {
      mode: "preserve",
      submittedSummary: request.submittedSummary,
      protectedTerms: request.protectedTerms,
    });
  }
  if (!validation.valid) {
    return unavailableCopyReview(
      request.submittedSummary,
      invalidOutputCopyReviewDiagnostic(),
    );
  }
  return {
    mode: "preserve",
    reviewStatus: "validated",
    diagnostic: null,
    submittedSummary: request.submittedSummary,
    publishedSummary: output.summary,
    copyResult: {
      result: output.result,
      change_reasons: [...output.change_reasons],
      policy_signal: output.policy_signal,
    },
  };
}

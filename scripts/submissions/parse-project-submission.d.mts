import type {
  ManifestValidation,
  ProjectSubmissionManifest,
} from "../../src/features/submissions/project-submission-manifest.mjs";

export type ProjectSubmissionParseResult =
  | {
      valid: true;
      source: "manifest" | "headings";
      manifest: ProjectSubmissionManifest;
    }
  | {
      valid: false;
      source: "manifest" | "headings";
      errors: string[];
    };

export function parseProjectSubmissionIssue(
  body: string,
  options?: { allowLegacyV3?: boolean },
): ProjectSubmissionParseResult;

export type { ManifestValidation };

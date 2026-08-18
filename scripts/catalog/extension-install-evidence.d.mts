export interface ExtensionInstallEvidenceInput {
  sourceId: string;
  repository: {
    provider: "github" | "codeberg";
    repositoryUrl: string;
    defaultBranch: string;
    headSha: string;
  };
  manifestPath: string;
  manifest: Record<string, unknown> | null;
  observedAt: string;
}

export interface ExtensionInstallEvidenceBase {
  schema_version: 1;
  source_id: string;
  head_sha: string;
  observed_at: string;
}

export interface VerifiedExtensionInstallEvidence extends ExtensionInstallEvidenceBase {
  status: "verified";
  manifest_path: "manifest.json";
  folder_name: string;
  manifest: {
    display_name: string;
    key: string | null;
    minimum_client_version: string | null;
  };
}

export interface UnavailableExtensionInstallEvidence extends ExtensionInstallEvidenceBase {
  status: "unavailable";
  reason:
    | "manifest-not-at-root"
    | "manifest-not-found"
    | "invalid-manifest"
    | "invalid-repository"
    | "fetch-failed";
}

export type ExtensionInstallEvidenceV1 =
  VerifiedExtensionInstallEvidence | UnavailableExtensionInstallEvidence;

export function deriveExtensionInstallEvidence(
  input: ExtensionInstallEvidenceInput,
): ExtensionInstallEvidenceV1;

export function refreshExtensionInstallEvidence(input: {
  projects: Array<Record<string, unknown>>;
  sources: Array<Record<string, unknown>>;
  snapshots: Array<Record<string, any>>;
  previousEvidence?: ExtensionInstallEvidenceV1[];
  sourceIds?: string[];
  providers: Partial<
    Record<
      "github" | "codeberg",
      | {
          readRootFile(input: {
            repository: string;
            ref: string;
            path: string;
          }): Promise<{
            path: string;
            content: string;
            encoding: "utf8";
          } | null>;
        }
      | undefined
    >
  >;
  observedAt: string;
}): Promise<{
  evidence: ExtensionInstallEvidenceV1[];
  changedEvidence: ExtensionInstallEvidenceV1[];
}>;

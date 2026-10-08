export interface SiteAsset {
  path: string;
  bytes: number;
  sha256: string;
}
export interface RevisionManifestInput {
  sourceSha: string;
  buildId: string;
  catalog: {
    schemaVersion: number;
    projects: unknown[];
    kits: unknown[];
    tagVocabulary: unknown;
    generatedAt?: string;
  };
  targets: {
    schema_version: number;
    repositories: unknown[];
    generated_at?: string;
  };
  files: SiteAsset[];
}
export interface RevisionManifest {
  schemaVersion: 1;
  sourceSha: string;
  buildId: string;
  catalogSchemaVersion: 8;
  targetSchemaVersion: 3;
  catalogDigest: string;
  targetDigest: string;
  buildDigest: string;
  assets: SiteAsset[];
}
export const REVISION_LIMITS: Readonly<{
  files: number;
  fileBytes: number;
  totalBytes: number;
  manifestBytes: number;
}>;
export const REQUIRED_SITE_ASSETS: readonly string[];
export function validSiteAssetPath(path: unknown): boolean;
export function buildRevisionManifest(
  input: RevisionManifestInput,
): RevisionManifest;
export function validateRevisionManifest(manifest: unknown): RevisionManifest;
export function readSiteAssets(outputDirectory: string): Promise<SiteAsset[]>;
export function writeRevisionManifest(input: {
  outputDirectory?: string;
  sourceSha: string;
  buildId: string;
}): Promise<RevisionManifest>;
export function verifyRevisionExport(input: {
  outputDirectory?: string;
  expectedSourceSha: string;
  expectedBuildId?: string;
}): Promise<RevisionManifest>;

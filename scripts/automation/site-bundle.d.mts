import type { RevisionManifest } from "./revision-manifest.mjs";
export interface SiteBundleEntry {
  path: string;
  type: "file";
  content: Uint8Array;
}
export interface VerifiedBundle {
  manifest: RevisionManifest;
  entries: SiteBundleEntry[];
  archiveDigest: string;
  listedSourceIds: string[];
  listedProjectIds: string[];
  listedKitIds: string[];
}
export const SITE_BUNDLE_LIMITS: Readonly<{
  archiveBytes: number;
  payloadBytes: number;
  headerBytes: number;
  files: number;
}>;
export function validateSiteBundle(input: {
  manifest: RevisionManifest;
  entries: SiteBundleEntry[];
  archiveDigest: string;
}): VerifiedBundle;
export function encodeSiteBundle(input: {
  manifest: RevisionManifest;
  entries: SiteBundleEntry[];
}): { archive: Uint8Array; archiveDigest: string };
export function decodeSiteBundle(input: {
  archive: Uint8Array;
  archiveDigest: string;
}): VerifiedBundle;
export function createSiteBundle(input: {
  outputDirectory?: string;
  sourceSha: string;
  buildId: string;
}): Promise<{ archive: Uint8Array; archiveDigest: string }>;
export function restoreSiteBundle(input: {
  verified: VerifiedBundle;
  outputDirectory: string;
}): Promise<RevisionManifest>;

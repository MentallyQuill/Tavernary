import type { RevisionManifest } from "./revision-manifest.mjs";
import type { DeploymentInventoryEvidence } from "./deployment-operations.mjs";
import type { Catalog } from "../../src/features/catalog/catalog-types.ts";
export interface ConfirmedDeployment extends DeploymentInventoryEvidence {
  schema_version: 1;
  status: "confirmed";
  buildId: string;
  bundleDigest: string;
  confirmedAt: string;
  confirmation: NonNullable<DeploymentInventoryEvidence["confirmation"]>;
}
export type ConfirmationReason =
  | "invalid-expected-manifest"
  | "public-unavailable"
  | "invalid-public-manifest"
  | "different-revision"
  | "different-build"
  | "essential-browser-failed"
  | "public-integrity-failed";
export type ConfirmationResult =
  | { status: "confirmed"; deployment: ConfirmedDeployment }
  | { status: "waiting" | "incident"; reason: ConfirmationReason };
export interface ConfirmationInput {
  expected: RevisionManifest;
  nowMs: number;
  fetchManifest: () => Promise<unknown>;
  fetchCatalog: () => Promise<Uint8Array>;
  fetchTargets: () => Promise<Uint8Array>;
  fetchAsset: (path: string) => Promise<Uint8Array>;
  browserSmoke: (input: {
    expected: RevisionManifest;
    catalog: Catalog;
  }) => Promise<boolean>;
}
export function confirmDeployment(
  input: ConfirmationInput,
): Promise<ConfirmationResult>;
export function pollDeploymentConfirmation(input: {
  signal?: AbortSignal;
  attempt: () => Promise<ConfirmationResult>;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
}): Promise<ConfirmationResult>;
export function deploymentSiteOrigin(input?: {
  mode?: "production" | "fixture";
  fixtureOrigin?: string;
}): string;
export function createPublicAssetReader(input: {
  signal?: AbortSignal;
  expected: RevisionManifest;
  mode?: "production" | "fixture";
  fixtureOrigin?: string;
  fetchImpl?: typeof fetch;
}): (path: string) => Promise<Uint8Array>;
export function confirmPublicDeployment(input: {
  expected: RevisionManifest;
  mode?: "production" | "fixture";
  fixtureOrigin?: string;
  fetchImpl?: typeof fetch;
  browserSmoke?: ConfirmationInput["browserSmoke"];
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<ConfirmationResult>;

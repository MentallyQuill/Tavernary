import type { ExtensionInstallEvidenceV1 } from "./extension-install-evidence.mjs";

export function backfillExtensionInstallEvidence(options?: {
  inputs?: {
    projects: Array<Record<string, unknown>>;
    sources: Array<Record<string, unknown>>;
    snapshots: Array<Record<string, unknown>>;
    installEvidence: ExtensionInstallEvidenceV1[];
  };
  sourceIds?: string[];
  providers?: Record<string, unknown>;
  observedAt?: string;
  validate?: (input: Record<string, unknown>) => Promise<{ errors: string[] }>;
  build?: (input: Record<string, unknown>) => Promise<unknown>;
  publish?: (evidence: ExtensionInstallEvidenceV1[]) => Promise<void>;
}): Promise<{
  changed: number;
  verified: number;
  unavailable: number;
}>;

export function parseBackfillExtensionInstallEvidenceCli(argv: string[]): {
  sourceIds: string[];
};

import type { PublicHelpManifest } from "../../src/features/help/help-manifest.mjs";

export interface LabelDefinition {
  color: string;
  description: string;
}

export const HELP_LABEL_DEFINITIONS: Readonly<
  Record<string, Readonly<LabelDefinition>>
>;
export const HELP_ROUTE_BY_LABEL: Readonly<Record<string, string>>;
export const HELP_LABEL_BY_ROUTE: Readonly<Record<string, string>>;
export const PUBLIC_HELP_TRIAGE_LABELS: readonly string[];

export function categoryLabels(manifest: PublicHelpManifest): string[];

import type {
  ExternalSourceIdentity,
  GithubSourceIdentity,
} from "./source-identity.mjs";

export interface FrontendVocabularyEntry {
  id: string;
  label: string;
  description: string;
  aliases?: string[];
}

export interface FrontendVocabulary {
  frontends: FrontendVocabularyEntry[];
}

export interface FrontendProject {
  id: string;
  name: string;
  kind: string;
  source_id: string;
  frontends?: string[];
}

export interface FrontendSuggestion {
  submitted: string;
  candidates: Array<{ id: string; label: string }>;
}

export interface MissingFrontendDependency {
  name: string;
  canonicalUrl: string;
  repository?: string;
}

export type FrontendResolution =
  | { status: "resolved"; ids: string[]; warnings: string[] }
  | {
      status: "needs-information";
      errors: string[];
      suggestions: FrontendSuggestion[];
      dependencies: MissingFrontendDependency[];
    };

export interface FrontendReconciliationInput {
  projectType: "extension" | "preset";
  knownIds: string[];
  other: Array<{ name: string; url: string }>;
  frontendIndependent: boolean;
  vocabulary: FrontendVocabulary | FrontendVocabularyEntry[];
  frontendProjects: FrontendProject[];
  sourcesById: Record<
    string,
    {
      type: string;
      repository?: string;
      repository_id?: number | null;
      url?: string;
    }
  >;
}

export interface FrontendVocabularyProposal {
  entry: FrontendVocabularyEntry;
  warning: string | null;
}

export function reconcileFrontends(
  input: FrontendReconciliationInput,
): FrontendResolution;

export function proposeFrontendVocabularyEntry(input: {
  displayName: string;
  sourceIdentity: GithubSourceIdentity | ExternalSourceIdentity;
  vocabulary: FrontendVocabulary | FrontendVocabularyEntry[];
  frontendProjects: FrontendProject[];
}): FrontendVocabularyProposal;

export function normalizeLabel(value: string): string;

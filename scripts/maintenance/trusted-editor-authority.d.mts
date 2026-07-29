export type TrustedEditorRole = "owner" | "admin" | "maintainer";

export interface TrustedEditorRegistry {
  schema_version: 1;
  editors: Array<{
    github_user_id: number;
    login: string;
    role: TrustedEditorRole;
  }>;
}

export type TrustedEditorDecision =
  | {
      authorized: true;
      actorLogin: string;
      role: TrustedEditorRole;
    }
  | {
      authorized: false;
      reasonCode:
        | "registry-invalid"
        | "actor-invalid"
        | "actor-not-trusted"
        | "association-not-trusted";
    };

export function validateTrustedEditorRegistry(
  registry: unknown,
): { valid: true } | { valid: false; errors: string[] };

export function verifyTrustedEditor(input: {
  actor?: { id?: number; login?: string };
  association?: string;
  registry: TrustedEditorRegistry;
}): TrustedEditorDecision;

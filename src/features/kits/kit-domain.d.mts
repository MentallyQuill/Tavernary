export interface KitDomainProject {
  id: string;
  kind: string;
  visibility?: string;
}

export interface KitDomainDraft {
  operation: "create" | "edit";
  kitId: string | null;
  title: string;
  description: string;
  projectIds: string[];
}

export interface KitDraftValidation {
  valid: boolean;
  errors: string[];
}

export function kitSetKey(projectIds: string[]): string;
export function validateKitDraft(
  draft: KitDomainDraft,
  projects: KitDomainProject[],
): KitDraftValidation;

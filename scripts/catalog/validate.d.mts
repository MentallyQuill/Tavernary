export interface ValidationResult {
  projectCount: number;
  errors: string[];
}

export function validateCatalog(options?: {
  records?: unknown[];
}): Promise<ValidationResult>;

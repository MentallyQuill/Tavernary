import type {
  IdentityRecord,
  IdentitySnapshot,
  RepositoryIdentityBackfillResult,
} from "./repository-identity-backfill.mjs";
import type { ValidationResult } from "./validate.mjs";

export function planRepositoryIdentityBackfill(options: {
  records: IdentityRecord[];
  snapshots: IdentitySnapshot[];
  validateCatalog?: (options: {
    records: IdentityRecord[];
    snapshots: IdentitySnapshot[];
  }) => Promise<ValidationResult>;
}): Promise<
  RepositoryIdentityBackfillResult & {
    projectedRecords: IdentityRecord[];
    validation: ValidationResult;
  }
>;

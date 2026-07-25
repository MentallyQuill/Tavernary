import type {
  IdentityRecord,
  IdentitySnapshot,
  RepositoryIdentityBackfillResult,
} from "./repository-identity-backfill.mjs";
import type { ValidationResult } from "./validate.mjs";

export function planRepositoryIdentityBackfill(options: {
  records: IdentityRecord[];
  snapshots: IdentitySnapshot[];
  projectIds?: ReadonlySet<string> | null;
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

export function parseIdentityBackfillArguments(argv: string[]): {
  write: boolean;
  projectIds: Set<string> | null;
};

export function writeUpdatedRecords(
  records: IdentityRecord[],
  directory?: string,
): Promise<void>;

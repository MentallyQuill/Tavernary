import type {
  IdentitySourceRecord,
  IdentitySnapshot,
  RepositoryIdentityBackfillResult,
} from "./repository-identity-backfill.mjs";
import type { ValidationResult } from "./validate.mjs";

export function planRepositoryIdentityBackfill(options: {
  records: IdentitySourceRecord[];
  snapshots: IdentitySnapshot[];
  sourceIds?: ReadonlySet<string> | null;
  validateCatalog?: (options: {
    sources: IdentitySourceRecord[];
    snapshots: IdentitySnapshot[];
  }) => Promise<ValidationResult>;
}): Promise<
  RepositoryIdentityBackfillResult & {
    projectedSources: IdentitySourceRecord[];
    validation: ValidationResult;
  }
>;

export function parseIdentityBackfillArguments(argv: string[]): {
  write: boolean;
  sourceIds: Set<string> | null;
};

export function writeUpdatedRecords(
  records: IdentitySourceRecord[],
  directory?: string,
): Promise<void>;

import type { IntakeMigrationResult } from "./intake-migration.mjs";
import type { ValidationResult } from "./validate.mjs";

export interface RunIntakeMigrationOptions {
  rootDirectory?: string;
  write?: boolean;
  enforceExpectedAudit?: boolean;
  cleanup?: boolean;
}

export function runIntakeMigration(
  options?: RunIntakeMigrationOptions,
): Promise<
  IntakeMigrationResult & {
    reportPath: string;
    validation: ValidationResult;
  }
>;

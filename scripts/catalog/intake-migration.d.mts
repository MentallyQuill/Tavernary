export interface IntakeMigrationResult {
  expectedRecords: Record<string, unknown>[];
  recordsToWrite: Record<string, unknown>[];
  report: Record<string, unknown>;
}

export function provisionalSummary(
  name: string,
  kind: "frontend" | "extension" | "preset",
  frontends: string[],
): string;

export function migrateIntake(input: {
  intake: Record<string, unknown>[];
  existingRecords: Record<string, unknown>[];
}): IntakeMigrationResult;

export interface ValidateKitDataOptions {
  kitRecords: Array<Record<string, unknown>>;
  projectRecords: Array<Record<string, unknown>>;
  supportSnapshots: Array<Record<string, unknown>>;
  blockedUsers: {
    schema_version: number;
    blocked: Array<{
      github_user_id: number;
      login: string;
      reason: string;
    }>;
  };
}

export function validateKitData(
  options: ValidateKitDataOptions,
): Promise<string[]>;

export interface KitWithdrawalManifest {
  schema_version: 1;
  request_kind: "kit-withdrawal";
  kit_id: string;
  confirmation: true;
}

export type KitWithdrawalManifestResult =
  | { valid: true; manifest: KitWithdrawalManifest }
  | { valid: false; errors: string[] };

export function normalizeKitWithdrawalManifest(
  value: unknown,
): KitWithdrawalManifestResult;

export function serializeKitWithdrawalManifest(
  value: KitWithdrawalManifest,
): string;

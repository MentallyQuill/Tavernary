export const STRUCTURAL_PRIMARY_FUNCTIONS: Readonly<{
  frontend: "frontend";
  preset: "preset";
}>;

export const EXTENSION_PRIMARY_FUNCTION_IDS: readonly string[];

export function classificationError(
  kind: string,
  primaryFunction: string,
): string | null;

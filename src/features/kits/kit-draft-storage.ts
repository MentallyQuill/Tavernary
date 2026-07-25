import type { KitDraft } from "@/features/kits/kit-types";

export const kitDraftStorageKey = "tavernary:kit-builder-draft:v1";

export type KitDraftOrigin = "create" | "duplicate" | "edit";

export type StoredKitDraft = {
  schemaVersion: 1;
  savedAt: string;
  draftOrigin: KitDraftOrigin;
  originalProjectIds: string[];
  draft: KitDraft;
};

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function isStoredKitDraft(value: unknown): value is StoredKitDraft {
  if (!value || typeof value !== "object") return false;
  const stored = value as Partial<StoredKitDraft>;
  const draft = stored.draft as Partial<KitDraft> | undefined;
  const structurallyValid =
    stored.schemaVersion === 1 &&
    typeof stored.savedAt === "string" &&
    (stored.draftOrigin === "create" ||
      stored.draftOrigin === "duplicate" ||
      stored.draftOrigin === "edit") &&
    isStringArray(stored.originalProjectIds) &&
    Boolean(draft) &&
    (draft?.operation === "create" || draft?.operation === "edit") &&
    (draft?.kitId === null || typeof draft?.kitId === "string") &&
    typeof draft?.title === "string" &&
    typeof draft?.description === "string" &&
    isStringArray(draft?.projectIds);
  if (!structurallyValid || !draft) return false;
  return draft.operation === "edit"
    ? stored.draftOrigin === "edit" &&
        typeof draft.kitId === "string" &&
        draft.kitId.length > 0
    : (stored.draftOrigin === "create" || stored.draftOrigin === "duplicate") &&
        draft.kitId === null;
}

export function readStoredKitDraft(): StoredKitDraft | null {
  try {
    const serialized = window.localStorage.getItem(kitDraftStorageKey);
    if (!serialized) return null;
    const stored: unknown = JSON.parse(serialized);
    if (!isStoredKitDraft(stored)) {
      window.localStorage.removeItem(kitDraftStorageKey);
      return null;
    }
    return stored;
  } catch {
    return null;
  }
}

export function writeStoredKitDraft(
  draftOrigin: KitDraftOrigin,
  originalProjectIds: string[],
  draft: KitDraft,
) {
  try {
    window.localStorage.setItem(
      kitDraftStorageKey,
      JSON.stringify({
        schemaVersion: 1,
        savedAt: new Date().toISOString(),
        draftOrigin,
        originalProjectIds,
        draft,
      } satisfies StoredKitDraft),
    );
  } catch {
    // The in-memory workspace remains usable when storage is unavailable.
  }
}

export function clearStoredKitDraft() {
  try {
    window.localStorage.removeItem(kitDraftStorageKey);
  } catch {
    // The in-memory workspace remains authoritative.
  }
}

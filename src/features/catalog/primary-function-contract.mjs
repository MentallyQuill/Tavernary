export const STRUCTURAL_PRIMARY_FUNCTIONS = Object.freeze({
  frontend: "frontend",
  preset: "preset",
});

export const EXTENSION_PRIMARY_FUNCTION_IDS = Object.freeze([
  "memory-retrieval",
  "generation-reasoning",
  "character-worldbuilding",
  "rpg-systems",
  "interface-workflow",
  "developer-infrastructure",
]);

const extensionPrimaryFunctions = new Set(EXTENSION_PRIMARY_FUNCTION_IDS);

export function classificationError(kind, primaryFunction) {
  if (kind === "frontend") {
    return primaryFunction === STRUCTURAL_PRIMARY_FUNCTIONS.frontend
      ? null
      : "Frontends must use primary function frontend.";
  }
  if (kind === "preset") {
    return primaryFunction === STRUCTURAL_PRIMARY_FUNCTIONS.preset
      ? null
      : "System Presets must use primary function preset.";
  }
  if (kind === "extension") {
    return extensionPrimaryFunctions.has(primaryFunction)
      ? null
      : "Extensions must use one approved Extension primary function.";
  }
  return "Project kind is invalid.";
}

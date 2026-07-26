export function matchesModelFamilies(selected: string[], available: string[]) {
  if (selected.length === 0) return true;
  if (
    available.includes("model-agnostic") &&
    selected.some((family) => family !== "model-agnostic")
  ) {
    return true;
  }
  return selected.some((family) => available.includes(family));
}

export function matchesCompletionFormats(
  selected: string[],
  available: string[],
) {
  return (
    selected.length === 0 ||
    selected.some((format) => available.includes(format))
  );
}

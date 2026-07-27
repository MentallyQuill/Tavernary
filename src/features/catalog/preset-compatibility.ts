export function matchesModelFamilies(selected: string[], available: string[]) {
  return (
    selected.length === 0 ||
    selected.some((family) => available.includes(family))
  );
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

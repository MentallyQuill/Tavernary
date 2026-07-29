import type { PublicTagDefinition } from "./tag-vocabulary";

export function matchesSelectedTags(
  selectedIds: string[],
  projectTagIds: string[],
  vocabulary: PublicTagDefinition[],
): boolean {
  if (selectedIds.length === 0) return true;
  const vocabularyById = new Map(vocabulary.map((tag) => [tag.id, tag]));
  const goals = new Set<string>();
  const traits = new Set<string>();
  for (const id of new Set(selectedIds)) {
    const definition = vocabularyById.get(id);
    if (!definition) return false;
    (definition.facet === "goal" ? goals : traits).add(id);
  }
  const projectTags = new Set(projectTagIds);
  return (
    (goals.size === 0 || [...goals].some((id) => projectTags.has(id))) &&
    (traits.size === 0 || [...traits].some((id) => projectTags.has(id)))
  );
}

function normalizedTerm(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase()
    .replace(/&/gu, " and ")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

export function legacyCapabilityTagIds(
  capabilityIds: string[],
  vocabulary: PublicTagDefinition[],
): string[] {
  const tagsByAlias = new Map<string, Set<string>>();
  for (const tag of vocabulary) {
    for (const alias of tag.aliases) {
      const normalized = normalizedTerm(alias);
      const owners = tagsByAlias.get(normalized) ?? new Set<string>();
      owners.add(tag.id);
      tagsByAlias.set(normalized, owners);
    }
  }
  const matchedIds = new Set<string>();
  for (const capabilityId of capabilityIds) {
    const owners = tagsByAlias.get(normalizedTerm(capabilityId));
    if (owners?.size === 1) matchedIds.add([...owners][0]);
  }
  return vocabulary.filter(({ id }) => matchedIds.has(id)).map(({ id }) => id);
}

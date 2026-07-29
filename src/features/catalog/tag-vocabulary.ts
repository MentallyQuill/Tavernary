import type { ProjectKind } from "./catalog-types";

export interface PublicTagDefinition {
  id: string;
  label: string;
  facet: "goal" | "trait";
  description: string;
  aliases: readonly string[];
  applicable_kinds: readonly ProjectKind[];
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function searchTags(
  tags: readonly PublicTagDefinition[],
  query: string,
): PublicTagDefinition[] {
  const search = normalized(query);
  if (!search) return [...tags];

  return tags.filter((tag) =>
    [tag.label, tag.description, ...tag.aliases].some((value) =>
      normalized(value).includes(search),
    ),
  );
}

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
  return value
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase()
    .replace(/&/gu, " and ")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
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

export type TagFacet = "goal" | "trait";
export type TagProjectKind = "frontend" | "extension" | "preset";

export interface TagDefinition {
  id: string;
  label: string;
  facet: TagFacet;
  description: string;
  aliases: string[];
  applicable_kinds: TagProjectKind[];
  inclusion_guidance: string[];
  exclusion_guidance: string[];
}

export type PublicTagDefinition = Omit<
  TagDefinition,
  "inclusion_guidance" | "exclusion_guidance"
>;

export interface TagVocabulary {
  schema_version: 1;
  tags: TagDefinition[];
}

export interface TagVocabularyValidation {
  valid: boolean;
  errors: string[];
}

export function validateTagVocabulary(value: unknown): TagVocabularyValidation;

export function publicTagVocabulary(
  value: TagVocabulary,
): PublicTagDefinition[];

export function indexTagVocabulary(
  value: TagVocabulary,
): Map<string, TagDefinition>;

export function tagsForKind(
  value: TagVocabulary,
  kind: TagProjectKind,
): TagDefinition[];

export function tagVocabularyHash(value: TagVocabulary): string;

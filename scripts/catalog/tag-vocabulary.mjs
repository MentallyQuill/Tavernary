import { createHash } from "node:crypto";

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function validateTagVocabulary(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      valid: false,
      errors: ["tag vocabulary must be an object."],
    };
  }
  const errors = [];
  if (!Array.isArray(value.tags)) {
    return {
      valid: false,
      errors: ["tag vocabulary tags must be an array."],
    };
  }
  const ids = new Set();
  const terms = new Set();
  for (const [index, tag] of value.tags.entries()) {
    if (!Array.isArray(tag.aliases)) {
      errors.push(`tags[${index}].aliases must be an array.`);
    }
    if (
      !Array.isArray(tag.inclusion_guidance) ||
      tag.inclusion_guidance.length === 0
    ) {
      errors.push(
        `tags[${index}].inclusion_guidance must contain at least one entry.`,
      );
    }
    if (!["goal", "trait"].includes(tag.facet)) {
      errors.push(`tags[${index}].facet must be "goal" or "trait".`);
    }
    if (ids.has(tag.id)) {
      errors.push(`tags[${index}].id duplicates tag ID ${tag.id}.`);
    }
    ids.add(tag.id);
    const definitions = [
      { path: `tags[${index}].label`, value: tag.label },
      ...(tag.aliases ?? []).map((alias, aliasIndex) => ({
        path: `tags[${index}].aliases[${aliasIndex}]`,
        value: alias,
      })),
    ];
    for (const definition of definitions) {
      const normalized = definition.value.trim().toLocaleLowerCase();
      if (terms.has(normalized)) {
        errors.push(
          `${definition.path} duplicates normalized vocabulary term "${normalized}".`,
        );
      }
      terms.add(normalized);
    }
  }
  return errors.length === 0
    ? { valid: true, errors: [] }
    : { valid: false, errors };
}

export function publicTagVocabulary(value) {
  return value.tags.map(
    ({ id, label, facet, description, aliases, applicable_kinds }) => ({
      id,
      label,
      facet,
      description,
      aliases,
      applicable_kinds,
    }),
  );
}

export function indexTagVocabulary(value) {
  return new Map(value.tags.map((tag) => [tag.id, tag]));
}

export function tagsForKind(value, kind) {
  return value.tags.filter((tag) => tag.applicable_kinds.includes(kind));
}

export function tagVocabularyHash(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

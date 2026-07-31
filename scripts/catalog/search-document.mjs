const FIELD_NAMES = [
  "title",
  "aliases",
  "source",
  "summary",
  "kind",
  "primaryFunction",
  "tags",
  "frontends",
  "compatibility",
  "maintainers",
  "relationships",
];

function strings(values) {
  return [
    ...new Set(
      values
        .flat(Infinity)
        .filter((value) => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

function labelsAndAliases(entries) {
  return strings(
    entries.map((entry) => [entry?.label, ...(entry?.aliases ?? [])]),
  );
}

function sourceIdentity(source) {
  if (typeof source?.repository === "string") return source.repository;
  if (typeof source?.organization === "string") return source.organization;
  if (typeof source?.url === "string") {
    try {
      const url = new URL(source.url);
      return `${url.hostname}${url.pathname}`.replace(/\/+$/u, "");
    } catch {
      return source.url;
    }
  }
  return null;
}

function sourceOwnerOrOrganization(source) {
  if (typeof source?.repository === "string") {
    return source.repository.split("/")[0];
  }
  if (typeof source?.organization === "string") return source.organization;
  return null;
}

export function assertSearchFields(fields, context) {
  const unknownFields = Object.keys(fields).filter(
    (field) => !FIELD_NAMES.includes(field),
  );
  if (unknownFields.length > 0) {
    throw new TypeError(
      `${context}.search has unknown fields: ${unknownFields.join(", ")}`,
    );
  }

  for (const field of FIELD_NAMES) {
    if (!Array.isArray(fields[field])) {
      throw new TypeError(`${context}.search.${field} must be an array`);
    }
    for (const value of fields[field]) {
      if (
        typeof value !== "string" ||
        !value.trim() ||
        value.includes("[object Object]")
      ) {
        throw new TypeError(`${context}.search.${field} has invalid text`);
      }
    }
  }
  if (fields.title.length !== 1) {
    throw new TypeError(`${context}.search.title must contain one title`);
  }
}

export function projectSearchFields({
  completionFormats,
  frontends,
  modelFamilies,
  primaryFunction,
  project,
  record,
  source,
  tags,
}) {
  const fields = {
    title: strings([project.name]),
    aliases: strings(record.aliases ?? []),
    source: strings([
      project.id,
      source.id,
      sourceIdentity(source),
      project.canonicalUrl,
    ]),
    summary: strings([project.summary]),
    kind: strings([project.kind]),
    primaryFunction: labelsAndAliases([primaryFunction]),
    tags: labelsAndAliases(tags),
    frontends: labelsAndAliases(frontends),
    compatibility: labelsAndAliases([...modelFamilies, ...completionFormats]),
    maintainers: strings([
      project.attribution?.owner.login,
      ...(project.attribution?.contributors.map(({ login }) => login) ?? []),
      sourceOwnerOrOrganization(source),
    ]),
    relationships: strings([
      project.fork?.parentName,
      project.fork?.parentProjectId,
    ]),
  };
  assertSearchFields(fields, project.id);
  return fields;
}

export function kitSearchFields({ frontends, kit, modelFamilies, purposes }) {
  const componentNames = kit.components.map(({ name }) => name);
  const componentIds = kit.components.map(({ projectId }) => projectId);
  const fields = {
    title: strings([kit.title]),
    aliases: strings(componentNames),
    source: strings([kit.id, kit.sourceIssueUrl]),
    summary: strings([kit.description]),
    kind: ["kit"],
    primaryFunction: labelsAndAliases(purposes),
    tags: labelsAndAliases(purposes),
    frontends: labelsAndAliases(frontends),
    compatibility: labelsAndAliases(modelFamilies),
    maintainers: strings([kit.author.login]),
    relationships: strings([componentNames, componentIds]),
  };
  assertSearchFields(fields, kit.id);
  return fields;
}

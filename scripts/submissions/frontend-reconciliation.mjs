import { parseSourceIdentity } from "./source-identity.mjs";

const explicitAliases = new Map([
  ["st", "sillytavern"],
  ["silly tavern", "sillytavern"],
  ["lumi verse", "lumiverse"],
  ["marinara", "marinara-engine"],
  ["sonder", "sonder-engine"],
]);

function normalizeLabel(value) {
  return value
    .normalize("NFKD")
    .replace(/\p{Mark}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function vocabularyEntries(vocabulary) {
  return Array.isArray(vocabulary) ? vocabulary : vocabulary.frontends;
}

function editDistance(left, right) {
  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function closeCandidates(value, entries) {
  const normalized = normalizeLabel(value);
  if (!normalized) return [];
  const threshold = Math.max(2, Math.floor(normalized.length * 0.25));
  return entries
    .map((entry) => ({
      id: entry.id,
      label: entry.label,
      distance: Math.min(
        editDistance(normalized, normalizeLabel(entry.id)),
        editDistance(normalized, normalizeLabel(entry.label)),
      ),
    }))
    .filter((entry) => entry.distance <= threshold)
    .sort(
      (left, right) =>
        left.distance - right.distance || left.label.localeCompare(right.label),
    )
    .map(({ id, label }) => ({ id, label }));
}

function frontendIndexes(vocabulary, frontendProjects) {
  const entries = vocabularyEntries(vocabulary);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const byLabel = new Map();
  for (const entry of entries) {
    for (const label of [entry.id, entry.label, ...(entry.aliases ?? [])]) {
      byLabel.set(normalizeLabel(label), entry.id);
    }
  }
  for (const [alias, id] of explicitAliases) {
    if (byId.has(id)) byLabel.set(alias, id);
  }

  const byRepository = new Map();
  for (const project of frontendProjects) {
    if (project.kind !== "frontend" || project.source?.type !== "github") {
      continue;
    }
    const frontendId = project.frontends?.[0];
    if (!byId.has(frontendId)) continue;
    const identity = parseSourceIdentity(
      `https://github.com/${project.source.repository}`,
    );
    byRepository.set(identity.canonicalUrl.toLowerCase(), frontendId);
  }
  return { entries, byId, byLabel, byRepository };
}

export function reconcileFrontends(input) {
  if (input.projectType === "extension" && input.frontendIndependent) {
    return {
      status: "needs-information",
      errors: ["Extensions must identify at least one supported frontend."],
      suggestions: [],
    };
  }
  if (input.projectType === "preset" && input.frontendIndependent) {
    return { status: "resolved", ids: [], warnings: [] };
  }
  const indexes = frontendIndexes(input.vocabulary, input.frontendProjects);
  const ids = [];
  const errors = [];
  const suggestions = [];
  const warnings = [];

  function add(id) {
    if (!ids.includes(id)) ids.push(id);
  }

  for (const submittedId of input.knownIds) {
    const resolved = indexes.byId.has(submittedId)
      ? submittedId
      : indexes.byLabel.get(normalizeLabel(submittedId));
    if (resolved) {
      add(resolved);
    } else {
      const candidates = closeCandidates(submittedId, indexes.entries);
      if (candidates.length === 1) {
        add(candidates[0].id);
        warnings.push(`Interpreted ${submittedId} as ${candidates[0].label}.`);
      } else {
        errors.push(`Unknown frontend: ${submittedId}.`);
        suggestions.push({ submitted: submittedId, candidates });
      }
    }
  }

  for (const submitted of input.other) {
    let resolvedByUrl;
    if (submitted.url?.trim()) {
      try {
        const identity = parseSourceIdentity(submitted.url.trim());
        if (identity.kind === "github") {
          resolvedByUrl = indexes.byRepository.get(
            identity.canonicalUrl.toLowerCase(),
          );
        }
      } catch {
        // The admission layer reports malformed submitted URLs.
      }
    }
    const resolvedByName = indexes.byLabel.get(
      normalizeLabel(submitted.name ?? ""),
    );
    const resolved = resolvedByUrl ?? resolvedByName;
    if (resolved) {
      add(resolved);
    } else {
      const submittedLabel = submitted.name || submitted.url;
      const candidates = closeCandidates(submittedLabel, indexes.entries);
      if (candidates.length === 1) {
        add(candidates[0].id);
        warnings.push(
          `Interpreted ${submittedLabel} as ${candidates[0].label}.`,
        );
      } else {
        errors.push(`Unknown frontend: ${submittedLabel}.`);
        suggestions.push({ submitted: submittedLabel, candidates });
      }
    }
  }

  if (errors.length > 0) {
    return { status: "needs-information", errors, suggestions };
  }
  if (ids.length === 0) {
    return {
      status: "needs-information",
      errors: [
        input.projectType === "preset"
          ? "Select a supported frontend or mark the preset independent."
          : "Select at least one supported frontend.",
      ],
      suggestions: [],
    };
  }
  return { status: "resolved", ids, warnings };
}

function frontendId(value) {
  return normalizeLabel(value).replace(/\s+/gu, "-");
}

export function proposeFrontendVocabularyEntry(input) {
  const displayName = input.displayName.trim().replace(/\s+/gu, " ");
  const baseId = frontendId(displayName);
  if (!baseId) throw new Error("Frontend display name is required.");
  if (input.sourceIdentity.kind !== "github") {
    throw new Error("Frontend submissions require a GitHub repository.");
  }

  const entries = vocabularyEntries(input.vocabulary);
  const usedIds = new Set(entries.map((entry) => entry.id));
  const usedLabels = new Set(
    entries.map((entry) => normalizeLabel(entry.label)),
  );
  const collided =
    usedIds.has(baseId) || usedLabels.has(normalizeLabel(displayName));
  let id = baseId;
  if (collided) {
    const ownerSuffix = frontendId(input.sourceIdentity.owner);
    id = `${baseId}-${ownerSuffix}`;
    let discriminator = 2;
    while (usedIds.has(id)) {
      id = `${baseId}-${ownerSuffix}-${discriminator}`;
      discriminator += 1;
    }
  }

  return {
    entry: {
      id,
      label: displayName,
      description: `Works with the ${displayName} roleplay frontend.`,
    },
    warning: collided
      ? `Frontend ID ${baseId} was already used; proposed ${id}.`
      : null,
  };
}

export { normalizeLabel };

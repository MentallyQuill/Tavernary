function tagIndex(vocabulary) {
  return new Map(
    (Array.isArray(vocabulary?.tags) ? vocabulary.tags : []).map((tag) => [
      tag.id,
      tag,
    ]),
  );
}

export function validateTagSelection({ tags, vocabulary, kind }) {
  const errors = [];
  if (!Array.isArray(tags)) {
    return { valid: false, errors: ["tags must be an array"] };
  }
  if (tags.length > 6) {
    errors.push("tags must contain at most 6 IDs");
  }

  const seen = new Set();
  const vocabularyById = tagIndex(vocabulary);
  for (const id of tags) {
    if (typeof id !== "string" || id.length === 0) {
      errors.push("tags must contain non-empty string IDs");
      continue;
    }
    if (seen.has(id)) {
      errors.push("tags must contain unique IDs");
    }
    seen.add(id);

    const definition = vocabularyById.get(id);
    if (!definition) {
      errors.push(`tags contains unknown ID: ${id}`);
    } else if (!definition.applicable_kinds?.includes(kind)) {
      errors.push(`tag ${id} does not apply to ${kind}`);
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

function evidenceErrors(evidence, label) {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    return [`${label} requires at least one evidence reference`];
  }
  if (
    evidence.some(
      (reference) =>
        typeof reference !== "string" ||
        reference.trim().length === 0 ||
        reference.length > 160 ||
        /[\r\n\u2028\u2029]/u.test(reference),
    )
  ) {
    return [
      `${label} evidence references must be non-empty single-line strings of 160 characters or fewer`,
    ];
  }
  return [];
}

function summaryErrors(summary) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return ["summary must be an object"];
  }

  const errors = [];
  const unknownKeys = Object.keys(summary).filter(
    (key) => !["value", "evidence"].includes(key),
  );
  for (const key of unknownKeys) {
    errors.push(`summary contains unknown key: ${key}`);
  }

  const value = summary.value;
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push("summary value must be a non-empty string");
  } else {
    const wordCount = value.trim().split(/\s+/u).filter(Boolean).length;
    if (value.length > 220) {
      errors.push("summary value must be 220 characters or fewer");
    }
    if (wordCount < 24 || wordCount > 36) {
      errors.push("summary value must contain between 24 and 36 words");
    }
    if (/[\r\n\u2028\u2029]/u.test(value)) {
      errors.push("summary value must not contain line breaks");
    }
    if (/```|`|[*_#[\]>]|^\s*(?:[-*+]\s|\d+[.)]\s)/mu.test(value)) {
      errors.push("summary value must not contain markdown or list syntax");
    }
    const endings = value.match(/[.!?](?=\s|$)/gu) ?? [];
    if (endings.length !== 2 || !/[.!?]$/u.test(value.trim())) {
      errors.push("summary value must be exactly two sentences");
    }
  }
  errors.push(...evidenceErrors(summary.evidence, "summary"));
  return errors;
}

export function validateTagGenerationOutput(output, request) {
  const errors = [];
  const fields = Array.isArray(request?.fields) ? request.fields : [];
  const requested = new Set(fields);
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return { valid: false, errors: ["generation output must be an object"] };
  }

  for (const key of Object.keys(output)) {
    if (!["summary", "tags"].includes(key)) {
      errors.push(`generation output contains unknown key: ${key}`);
    } else if (!requested.has(key)) {
      errors.push(`${key} was not requested`);
    }
  }
  for (const field of requested) {
    if (!Object.hasOwn(output, field)) {
      errors.push(`${field} was requested but is missing`);
    }
  }

  let summary;
  let summaryEvidence;
  if (requested.has("summary") && Object.hasOwn(output, "summary")) {
    errors.push(...summaryErrors(output.summary));
    if (
      output.summary &&
      typeof output.summary === "object" &&
      !Array.isArray(output.summary)
    ) {
      summary = output.summary.value;
      summaryEvidence = output.summary.evidence;
    }
  }

  const tags = [];
  const evidence = {};
  if (requested.has("tags") && Object.hasOwn(output, "tags")) {
    if (!Array.isArray(output.tags)) {
      errors.push("tags generation output must be an array");
    } else {
      for (const entry of output.tags) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          errors.push("generated tag entries must be objects");
          continue;
        }
        const unknownKeys = Object.keys(entry).filter(
          (key) => !["id", "evidence"].includes(key),
        );
        for (const key of unknownKeys) {
          errors.push(`generated tag entry contains unknown key: ${key}`);
        }
        if (typeof entry.id !== "string" || entry.id.length === 0) {
          errors.push("generated tag entry id must be a non-empty string");
          continue;
        }
        tags.push(entry.id);
        errors.push(...evidenceErrors(entry.evidence, `tag ${entry.id}`));
        if (Array.isArray(entry.evidence)) {
          evidence[entry.id] = [...entry.evidence];
        }
      }
      const selection = validateTagSelection({
        tags,
        vocabulary: request.vocabulary,
        kind: request.kind,
      });
      if (!selection.valid) {
        errors.push(...selection.errors);
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors: [...new Set(errors)] };
  }

  return {
    valid: true,
    ...(requested.has("summary") ? { summary, summaryEvidence } : {}),
    ...(requested.has("tags") ? { tags, evidence } : {}),
  };
}

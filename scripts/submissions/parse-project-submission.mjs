import { normalizeProjectSubmissionManifest } from "../../src/features/submissions/project-submission-manifest.mjs";
import completionFormatVocabulary from "../../data/vocabularies/completion-formats.json" with { type: "json" };
import modelFamilyVocabulary from "../../data/vocabularies/model-families.json" with { type: "json" };
import primaryFunctionVocabulary from "../../data/vocabularies/primary-functions.json" with { type: "json" };
import tagVocabulary from "../../data/vocabularies/tags.json" with { type: "json" };
import { STRUCTURAL_PRIMARY_FUNCTIONS } from "../../src/features/catalog/primary-function-contract.mjs";

function issueFields(body) {
  const fields = new Map();
  for (const section of body.split(/^### /mu).slice(1)) {
    const [heading, ...content] = section.split(/\r?\n/u);
    const value = content.join("\n").trim();
    fields.set(heading.trim(), /^_No response_$/iu.test(value) ? "" : value);
  }
  return fields;
}

function manifestJson(value) {
  const rendered = value.match(/^```json\s*\r?\n([\s\S]*?)\r?\n```$/iu);
  return rendered?.[1] ?? value;
}

function projectType(value) {
  return {
    Frontend: "frontend",
    Extension: "extension",
    "System Preset": "preset",
  }[value];
}

function fallbackFrontends(value) {
  const entries = value
    .split(/[,\n]/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries.map((entry) =>
    /^https:\/\//iu.test(entry)
      ? { name: "", url: entry }
      : { name: entry, url: "" },
  );
}

function checkedValues(value) {
  return value
    .split(/\r?\n/u)
    .flatMap((line) => line.match(/^-\s+\[[xX]\]\s+(.+)$/u)?.[1] ?? [])
    .map((entry) => entry.trim());
}

function fieldValues(value) {
  const lines = value.split(/\r?\n/u);
  const hasCheckboxMarkup = lines.some((line) =>
    /^-\s+\[[ xX]\]\s+/u.test(line),
  );
  if (hasCheckboxMarkup) return checkedValues(value);
  return value
    .split(/[,\n]/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function fieldIds(value, options) {
  const byLabel = new Map(
    options.flatMap((option) => [
      [option.id.toLocaleLowerCase(), option.id],
      [option.label.toLocaleLowerCase(), option.id],
    ]),
  );
  return fieldValues(value).map(
    (entry) => byLabel.get(entry.toLocaleLowerCase()) ?? entry,
  );
}

function requestedMode(value, automaticPattern, manualPattern) {
  const normalized = value.trim();
  if (!normalized) return null;
  if (manualPattern.test(normalized)) return "manual";
  if (automaticPattern.test(normalized)) return "automatic";
  return "invalid";
}

export function parseProjectSubmissionIssue(body, options = {}) {
  const fields = issueFields(body);
  const embedded = fields.get("Project manifest") ?? "";
  const embeddedJson = manifestJson(embedded).trim();
  if (embeddedJson) {
    try {
      const result = normalizeProjectSubmissionManifest(
        JSON.parse(embeddedJson),
        {
          allowLegacyV3: options.allowLegacyV3 === true,
          tagVocabulary,
        },
      );
      return { ...result, source: "manifest" };
    } catch {
      return {
        valid: false,
        source: "manifest",
        errors: ["Project manifest must be valid JSON."],
      };
    }
  }

  const frontendIndependentValue = (
    fields.get("Frontend-independent") ?? ""
  ).trim();
  if (!/^(?:yes|no)$/iu.test(frontendIndependentValue)) {
    return {
      valid: false,
      source: "headings",
      errors: ["Frontend-independent must be Yes or No."],
    };
  }

  const parsedProjectType = projectType(fields.get("Project Type") ?? "");
  const submittedPrimaryFunction = fieldIds(
    fields.get("Primary function") ?? "",
    primaryFunctionVocabulary.primary_functions,
  )[0];
  const primaryFunction =
    parsedProjectType === "frontend"
      ? submittedPrimaryFunction || STRUCTURAL_PRIMARY_FUNCTIONS.frontend
      : parsedProjectType === "preset"
        ? submittedPrimaryFunction || STRUCTURAL_PRIMARY_FUNCTIONS.preset
        : submittedPrimaryFunction || "";
  const legacyDescription = fields.get("Short Description") ?? "";
  const summaryMode =
    requestedMode(
      fields.get("Description choice") ?? "",
      /let.+tavernai.+write|automatic/iu,
      /write.+myself|manual/iu,
    ) ?? (legacyDescription.trim() ? "manual" : "automatic");
  const tagsMode =
    requestedMode(
      fields.get("Tag choice") ?? "",
      /let.+tavernary.+select|automatic/iu,
      /set.+myself|manual/iu,
    ) ?? "automatic";
  const choiceErrors = [
    ...(summaryMode === "invalid"
      ? ["Description choice must be automatic or manual."]
      : []),
    ...(tagsMode === "invalid"
      ? ["Tag choice must be automatic or manual."]
      : []),
  ];
  if (choiceErrors.length > 0) {
    return { valid: false, source: "headings", errors: choiceErrors };
  }
  const requestedTags = fieldIds(fields.get("Tags") ?? "", tagVocabulary.tags);

  const result = normalizeProjectSubmissionManifest(
    {
      schema_version: 4,
      project_type: parsedProjectType,
      primary_function: primaryFunction,
      source_url: fields.get("Project URL") ?? "",
      frontends: {
        known_ids: [],
        other: fallbackFrontends(fields.get("Supported frontends") ?? ""),
      },
      frontend_independent: frontendIndependentValue.toLowerCase() === "yes",
      additional_context: fields.get("Anything we should know?") ?? "",
      metadata: {
        summary:
          summaryMode === "manual"
            ? { mode: "manual", value: legacyDescription }
            : { mode: "automatic" },
        tags:
          tagsMode === "manual"
            ? { mode: "manual", values: requestedTags }
            : { mode: "automatic" },
      },
      ...(parsedProjectType === "preset"
        ? {
            preset_compatibility: {
              model_families: {
                known_ids: fieldIds(
                  fields.get("Supported model families") ?? "",
                  modelFamilyVocabulary.model_families,
                ),
                other: [fields.get("Other model family") ?? ""].filter(Boolean),
              },
              completion_formats: fieldIds(
                fields.get("Completion formats") ?? "",
                completionFormatVocabulary.completion_formats,
              ),
            },
          }
        : {}),
    },
    { tagVocabulary },
  );
  return { ...result, source: "headings" };
}

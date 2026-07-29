import { normalizeProjectSubmissionManifest } from "../../src/features/submissions/project-submission-manifest.mjs";
import completionFormatVocabulary from "../../data/vocabularies/completion-formats.json" with { type: "json" };
import modelFamilyVocabulary from "../../data/vocabularies/model-families.json" with { type: "json" };
import primaryFunctionVocabulary from "../../data/vocabularies/primary-functions.json" with { type: "json" };
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

export function parseProjectSubmissionIssue(body) {
  const fields = issueFields(body);
  const embedded = fields.get("Project manifest") ?? "";
  const embeddedJson = manifestJson(embedded).trim();
  if (embeddedJson) {
    try {
      const result = normalizeProjectSubmissionManifest(
        JSON.parse(embeddedJson),
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

  const result = normalizeProjectSubmissionManifest({
    schema_version: 3,
    project_type: parsedProjectType,
    primary_function: primaryFunction,
    source_url: fields.get("Project URL") ?? "",
    name: fields.get("Project Name") ?? "",
    description: fields.get("Short Description") ?? "",
    frontends: {
      known_ids: [],
      other: fallbackFrontends(fields.get("Supported frontends") ?? ""),
    },
    frontend_independent: frontendIndependentValue.toLowerCase() === "yes",
    additional_context: fields.get("Anything we should know?") ?? "",
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
  });
  return { ...result, source: "headings" };
}

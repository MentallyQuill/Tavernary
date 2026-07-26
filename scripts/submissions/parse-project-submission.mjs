import { normalizeProjectSubmissionManifest } from "../../src/features/submissions/project-submission-manifest.mjs";
import completionFormatVocabulary from "../../data/vocabularies/completion-formats.json" with { type: "json" };
import modelFamilyVocabulary from "../../data/vocabularies/model-families.json" with { type: "json" };

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

function checkedIds(value, options) {
  const byLabel = new Map(
    options.flatMap((option) => [
      [option.id.toLocaleLowerCase(), option.id],
      [option.label.toLocaleLowerCase(), option.id],
    ]),
  );
  return checkedValues(value).flatMap((label) => {
    const id = byLabel.get(label.toLocaleLowerCase());
    return id ? [id] : [];
  });
}

export function parseProjectSubmissionIssue(body) {
  const fields = issueFields(body);
  const embedded = fields.get("Project manifest") ?? "";
  if (embedded) {
    try {
      const result = normalizeProjectSubmissionManifest(
        JSON.parse(manifestJson(embedded)),
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

  const result = normalizeProjectSubmissionManifest({
    schema_version: 2,
    project_type: projectType(fields.get("Project Type") ?? ""),
    source_url: fields.get("Project URL") ?? "",
    name: fields.get("Project Name") ?? "",
    description: fields.get("Short Description") ?? "",
    frontends: {
      known_ids: [],
      other: fallbackFrontends(fields.get("Supported frontends") ?? ""),
    },
    frontend_independent:
      (fields.get("Frontend-independent") ?? "").toLowerCase() === "yes",
    additional_context: fields.get("Anything we should know?") ?? "",
    preset_compatibility: {
      model_families: {
        known_ids: checkedIds(
          fields.get("Supported model families") ?? "",
          modelFamilyVocabulary.model_families,
        ),
        other: [fields.get("Other model family") ?? ""].filter(Boolean),
      },
      completion_formats: checkedIds(
        fields.get("Completion formats") ?? "",
        completionFormatVocabulary.completion_formats,
      ),
    },
  });
  return { ...result, source: "headings" };
}

import { normalizeProjectSubmissionManifest } from "../../src/features/submissions/project-submission-manifest.mjs";

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
    schema_version: 1,
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
  });
  return { ...result, source: "headings" };
}

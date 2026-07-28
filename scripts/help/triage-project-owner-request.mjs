import { readFile as defaultReadFile } from "node:fs/promises";
import { resolve } from "node:path";

import { normalizeProjectOwnerManifest } from "../../src/features/help/project-owner-manifest.mjs";
import { fingerprintProjectRecord } from "../../src/features/help/project-owner-record.mjs";
import {
  detectOwnerRequestConflict,
  verifyProjectOwnerAuthority,
} from "./project-owner-authority.mjs";

const PROJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const OWNER_HEADINGS = new Set([
  "Request type",
  "Project ID",
  "Current repository",
  "Proposed display name",
  "Proposed summary",
  "Supported frontends",
  "Primary function",
  "Capabilities",
  "Model families",
  "Completion formats",
  "Proposed repository",
  "Explanation or public note",
  "Delist confirmation",
  "Owner request manifest",
]);

function readable(value = "") {
  const normalized = String(value).trim();
  return /^_No response_$/iu.test(normalized) ? "" : normalized;
}

function issueLabels(issue) {
  return new Set(
    (issue?.labels ?? [])
      .map((label) => (typeof label === "string" ? label : label?.name))
      .filter(Boolean),
  );
}

function eligibleIssue(issue) {
  const labels = issueLabels(issue);
  return (
    issue?.state === "open" &&
    labels.has("issue-admitted") &&
    labels.has("project-owner-request")
  );
}

function collectHeadings(body = "") {
  const fields = new Map();
  const duplicates = [];
  for (const section of String(body).split(/^### /mu).slice(1)) {
    const [rawHeading, ...content] = section.split(/\r?\n/u);
    const heading = rawHeading.trim();
    if (!heading) continue;
    if (fields.has(heading) && OWNER_HEADINGS.has(heading)) {
      duplicates.push(heading);
      continue;
    }
    fields.set(heading, readable(content.join("\n")));
  }
  return { fields, duplicates };
}

function renderedJson(value) {
  return (
    value.match(/^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/iu)?.[1] ?? value
  );
}

function parseRepositoryLocation(value) {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    if (
      url.protocol !== "https:" ||
      url.hostname.toLocaleLowerCase() !== "github.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      parts.length !== 2
    ) {
      return null;
    }
    return `${parts[0]}/${parts[1]}`;
  } catch {
    return null;
  }
}

function lineValues(value) {
  return [
    ...new Set(
      String(value)
        .split(/[\r\n,]+/u)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
}

function originalCard(record) {
  return {
    kind: record.kind,
    name: record.name,
    summary: record.summary,
    frontends: record.frontends,
    primary_function: record.primary_function,
    capabilities: record.capabilities,
    model_families: Array.isArray(record.model_families)
      ? record.model_families
      : [],
    completion_formats: Array.isArray(record.completion_formats)
      ? record.completion_formats
      : [],
  };
}

function fallbackManifest(fields, record) {
  const operation = {
    "Edit card details": "edit-card",
    "Update repository location": "move-source",
    "Delist this project": "delist",
  }[fields.get("Request type")];
  const common = {
    schema_version: 1,
    request_kind: "project-owner",
    operation,
    project_id: fields.get("Project ID"),
    repository_id: record?.source?.repository_id,
    source_fingerprint: fingerprintProjectRecord(record),
    explanation: fields.get("Explanation or public note") || null,
  };
  if (operation === "edit-card") {
    return {
      ...common,
      original: originalCard(record),
      proposed: {
        name: fields.get("Proposed display name"),
        summary: fields.get("Proposed summary"),
        frontends: lineValues(fields.get("Supported frontends")),
        primary_function: fields.get("Primary function"),
        capabilities: lineValues(fields.get("Capabilities")),
        model_families: lineValues(fields.get("Model families")),
        completion_formats: lineValues(fields.get("Completion formats")),
      },
    };
  }
  if (operation === "move-source") {
    return {
      ...common,
      original: {
        repository: record?.source?.repository,
        repository_id: record?.source?.repository_id,
      },
      proposed: {
        repository: parseRepositoryLocation(fields.get("Proposed repository")),
        repository_id: record?.source?.repository_id,
      },
    };
  }
  return {
    ...common,
    original: { visibility: record?.visibility },
    proposed: {
      visibility: "disabled",
      visibility_reason: "removed",
      refresh_policy: "paused",
      enrichment_policy: "manual",
    },
  };
}

function preliminary(body) {
  const collected = collectHeadings(body);
  if (collected.duplicates.length > 0) {
    return {
      valid: false,
      errors: ["Owner request contains a duplicate recognized form heading."],
    };
  }
  const manifestValue = collected.fields.get("Owner request manifest") ?? "";
  if (manifestValue) {
    try {
      const manifest = JSON.parse(renderedJson(manifestValue));
      return {
        valid: true,
        source: "manifest",
        manifest,
        fields: collected.fields,
      };
    } catch {
      return {
        valid: false,
        errors: [
          "Owner request manifest is not valid JSON. Correct it or leave it empty to use the readable fields.",
        ],
      };
    }
  }
  return {
    valid: true,
    source: "fallback",
    manifest: null,
    fields: collected.fields,
  };
}

function projectIdFromParsed(parsed) {
  const value =
    parsed.source === "manifest"
      ? parsed.manifest?.project_id
      : parsed.fields.get("Project ID");
  return typeof value === "string" && PROJECT_ID_PATTERN.test(value)
    ? value
    : null;
}

function needsInformation(reasonCode, message, extra = {}) {
  return { status: "needs-information", reasonCode, message, ...extra };
}

function temporaryApiFailure(error) {
  const status = Number(error?.status);
  return (
    !Number.isFinite(status) ||
    status === 408 ||
    status === 429 ||
    status >= 500
  );
}

function repositoryIdentity(value) {
  return {
    id: value?.id,
    fullName: value?.fullName ?? value?.full_name,
    htmlUrl: value?.htmlUrl ?? value?.html_url,
    visibility:
      value?.visibility ?? (value?.private === false ? "public" : undefined),
    owner: value?.owner,
  };
}

function issueApiPath(issue) {
  if (typeof issue?.url === "string") {
    try {
      const url = new URL(issue.url);
      if (
        url.protocol === "https:" &&
        url.hostname.toLocaleLowerCase() === "api.github.com" &&
        /^\/repos\/[^/]+\/[^/]+\/issues\/[1-9]\d*$/u.test(url.pathname)
      ) {
        return url.pathname;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function issueChanged(before, after) {
  return (
    before?.number !== after?.number ||
    before?.updated_at !== after?.updated_at ||
    before?.body !== after?.body ||
    before?.state !== after?.state ||
    JSON.stringify([...issueLabels(before)].sort()) !==
      JSON.stringify([...issueLabels(after)].sort()) ||
    before?.user?.login !== after?.user?.login
  );
}

async function readRegistryRecord(input, projectId) {
  if (input.record) return structuredClone(input.record);
  const readFile = input.readFile ?? defaultReadFile;
  const path = resolve(
    input.root ?? ".",
    "data",
    "registry",
    "projects",
    `${projectId}.json`,
  );
  return JSON.parse(await readFile(path, "utf8"));
}

export async function processProjectOwnerTriage(input) {
  const issue = input?.issue;
  if (!eligibleIssue(issue)) {
    return needsInformation(
      "issue-not-eligible",
      "Owner request must be open, admitted, and labeled project-owner-request.",
    );
  }
  const parsed = preliminary(issue.body ?? "");
  if (!parsed.valid) {
    return needsInformation("owner-request-invalid", parsed.errors.join(" "), {
      errors: parsed.errors,
    });
  }
  const projectId = projectIdFromParsed(parsed);
  if (!projectId) {
    return needsInformation(
      "owner-request-invalid",
      "Owner request project ID is invalid.",
    );
  }

  let record;
  try {
    record = await readRegistryRecord(input, projectId);
  } catch {
    return needsInformation(
      "project-not-found",
      "Owner request project does not match a current registry record.",
    );
  }
  if (record?.id !== projectId) {
    return needsInformation(
      "project-not-found",
      "Owner request project does not match a current registry record.",
    );
  }

  const rawManifest =
    parsed.source === "manifest"
      ? parsed.manifest
      : fallbackManifest(parsed.fields, record);
  if (
    parsed.source === "fallback" &&
    rawManifest.operation === "delist" &&
    parsed.fields.get("Delist confirmation") !==
      "I am requesting that Tavernary delist this project"
  ) {
    return needsInformation(
      "owner-request-invalid",
      "Owner delisting requires the exact confirmation text.",
    );
  }
  const normalized = normalizeProjectOwnerManifest(
    rawManifest,
    input.vocabularies,
  );
  if (!normalized.valid) {
    return needsInformation(
      "owner-request-invalid",
      normalized.errors.join(" "),
      { errors: normalized.errors },
    );
  }

  let rawRepository = input.repository;
  if (!rawRepository) {
    if (typeof input.request !== "function") {
      return {
        status: "retryable",
        reasonCode: "github-api-temporary-failure",
        message: "GitHub repository identity could not be checked.",
      };
    }
    try {
      rawRepository = await input.request(
        `/repositories/${record.source?.repository_id}`,
      );
    } catch (error) {
      if (temporaryApiFailure(error)) {
        return {
          status: "retryable",
          reasonCode: "github-api-temporary-failure",
          message: "GitHub repository identity could not be checked.",
        };
      }
      return needsInformation(
        "repository-identity-unavailable",
        "The current repository identity could not be verified.",
      );
    }
  }
  const repository = repositoryIdentity(rawRepository);
  const authority = verifyProjectOwnerAuthority({
    issueAuthor: issue.user?.login,
    manifestRepositoryId: normalized.manifest.repository_id,
    record,
    repository,
  });
  if (!authority.authorized) {
    return needsInformation(
      authority.reasonCode,
      authority.reasonCode === "issue-author-not-owner"
        ? "Only the current personal GitHub repository owner can submit this request."
        : `Owner authority could not be verified: ${authority.reasonCode}.`,
    );
  }

  const conflict = detectOwnerRequestConflict({
    manifest: normalized.manifest,
    record,
  });
  if (conflict.conflict) {
    return needsInformation(
      conflict.reasonCode,
      `Current values changed for: ${conflict.fields.join(", ")}.`,
      { fields: conflict.fields },
    );
  }

  const refreshPath = issueApiPath(issue);
  if (typeof input.request === "function" && refreshPath) {
    try {
      const refreshed = await input.request(refreshPath);
      if (issueChanged(issue, refreshed)) {
        return {
          status: "retryable",
          reasonCode: "issue-changed-during-triage",
          message:
            "The issue changed during triage and must be processed again.",
        };
      }
      if (!eligibleIssue(refreshed)) {
        return needsInformation(
          "issue-not-eligible",
          "Owner request is no longer open and admitted.",
        );
      }
    } catch (error) {
      if (temporaryApiFailure(error)) {
        return {
          status: "retryable",
          reasonCode: "github-api-temporary-failure",
          message: "The latest issue state could not be checked.",
        };
      }
      return needsInformation(
        "issue-refresh-failed",
        "The latest issue state could not be verified.",
      );
    }
  }

  return {
    status: "admitted",
    issueNumber: issue.number,
    projectId,
    operation: normalized.manifest.operation,
    manifest: normalized.manifest,
    record,
    repository,
    verifiedOwnerLogin: authority.ownerLogin,
    warnings: conflict.warnings,
  };
}

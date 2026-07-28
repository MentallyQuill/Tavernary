import { expect, test, vi } from "vitest";

import { fingerprintProjectRecord } from "../../src/features/help/project-owner-record.mjs";
import { processProjectOwnerTriage } from "../../scripts/help/triage-project-owner-request.mjs";

const vocabularies = {
  frontends: ["sillytavern"],
  primaryFunctions: ["interface-workflow"],
  capabilities: ["automation"],
  modelFamilies: ["claude"],
  completionFormats: ["chat-completion"],
};

function record(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 5,
    id: "owner-alpha",
    name: "Alpha",
    kind: "extension",
    summary: "Original summary.",
    metadata_status: "provisional",
    source: {
      type: "github",
      repository: "Owner/Alpha",
      repository_id: 42,
    },
    frontends: ["sillytavern"],
    primary_function: "interface-workflow",
    capabilities: ["automation"],
    visibility: "published",
    visibility_reason: null,
    refresh_policy: "automatic",
    enrichment_policy: "automatic",
    ...overrides,
  };
}

function manifest(current = record()) {
  return {
    schema_version: 1,
    request_kind: "project-owner",
    operation: "edit-card",
    project_id: "owner-alpha",
    repository_id: 42,
    source_fingerprint: fingerprintProjectRecord(current),
    original: {
      kind: "extension",
      name: "Alpha",
      summary: "Original summary.",
      frontends: ["sillytavern"],
      primary_function: "interface-workflow",
      capabilities: ["automation"],
      model_families: [],
      completion_formats: [],
    },
    proposed: {
      name: "Alpha",
      summary: "Owner-authored summary.",
      frontends: ["sillytavern"],
      primary_function: "interface-workflow",
      capabilities: ["automation"],
      model_families: [],
      completion_formats: [],
    },
    explanation: null,
  };
}

function issue(bodyManifest = manifest()) {
  return {
    number: 123,
    state: "open",
    body: `### Current repository

https://github.com/Attacker/Wrong

### Owner request manifest

\`\`\`json
${JSON.stringify(bodyManifest)}
\`\`\``,
    labels: ["issue-admitted", "project-owner-request"],
    user: { login: "Owner" },
    url: "https://api.github.com/repos/Tavernary/Tavernary/issues/123",
    updated_at: "2026-07-28T12:00:00Z",
  };
}

const repository = {
  id: 42,
  fullName: "Owner/Alpha",
  htmlUrl: "https://github.com/Owner/Alpha",
  visibility: "public",
  owner: { login: "Owner", type: "User" },
};

test("reads the trusted record, resolves its immutable repository ID, and refreshes before admission", async () => {
  const current = record();
  const latest = issue();
  const chronology: string[] = [];
  const readFile = vi.fn(async (path: string) => {
    chronology.push(`read:${path.replaceAll("\\", "/")}`);
    return JSON.stringify(current);
  });
  const writeFile = vi.fn();
  const request = vi.fn(async (path: string) => {
    chronology.push(`request:${path}`);
    if (path === "/repositories/42") return repository;
    if (path === "/repos/Tavernary/Tavernary/issues/123") return latest;
    throw new Error(`unexpected request ${path}`);
  });

  await expect(
    processProjectOwnerTriage({
      issue: latest,
      root: "C:/repo",
      request,
      readFile,
      writeFile,
      vocabularies,
    }),
  ).resolves.toMatchObject({
    status: "admitted",
    issueNumber: 123,
    projectId: "owner-alpha",
    verifiedOwnerLogin: "Owner",
    warnings: [],
  });
  expect(chronology).toEqual([
    "read:C:/repo/data/registry/projects/owner-alpha.json",
    "request:/repositories/42",
    "request:/repos/Tavernary/Tavernary/issues/123",
  ]);
  expect(request).not.toHaveBeenCalledWith(expect.stringContaining("Attacker"));
  expect(writeFile).not.toHaveBeenCalled();
});

test("returns retryable when immutable repository resolution temporarily fails", async () => {
  const temporary = Object.assign(new Error("GitHub unavailable"), {
    status: 503,
  });

  await expect(
    processProjectOwnerTriage({
      issue: issue(),
      record: record(),
      vocabularies,
      request: vi.fn(async () => {
        throw temporary;
      }),
    }),
  ).resolves.toMatchObject({
    status: "retryable",
    reasonCode: "github-api-temporary-failure",
  });
});

test("returns needs-information with the literal personal-owner rule", async () => {
  const decision = await processProjectOwnerTriage({
    issue: { ...issue(), user: { login: "Contributor" } },
    record: record(),
    repository,
    vocabularies,
  });

  expect(decision).toMatchObject({
    status: "needs-information",
    reasonCode: "issue-author-not-owner",
  });
  if (decision.status === "admitted") throw new Error("expected rejection");
  expect(decision.message).toContain(
    "current personal GitHub repository owner",
  );
});

test("rejects overlapping stale values but preserves non-overlap fingerprint warnings", async () => {
  const stale = record({ summary: "Maintainer changed this summary." });
  await expect(
    processProjectOwnerTriage({
      issue: issue(),
      record: stale,
      repository,
      vocabularies,
    }),
  ).resolves.toMatchObject({
    status: "needs-information",
    reasonCode: "stale-owner-request",
    fields: ["summary"],
  });

  const nonOverlap = record({ catalog_cohort: "standard" });
  await expect(
    processProjectOwnerTriage({
      issue: issue(),
      record: nonOverlap,
      repository,
      vocabularies,
    }),
  ).resolves.toMatchObject({
    status: "admitted",
    warnings: ["source-fingerprint-changed"],
  });
});

test("constructs and validates a direct fallback without trusting its repository URL", async () => {
  const current = record();
  const fallbackIssue = {
    ...issue(),
    body: [
      ["Request type", "Edit card details"],
      ["Project ID", "owner-alpha"],
      ["Current repository", "https://github.com/Attacker/Wrong"],
      ["Proposed display name", "Alpha"],
      ["Proposed summary", "Fallback owner summary."],
      ["Supported frontends", "sillytavern"],
      ["Primary function", "interface-workflow"],
      ["Capabilities", "automation"],
      ["Model families", "_No response_"],
      ["Completion formats", "_No response_"],
      ["Proposed repository", "_No response_"],
      ["Explanation or public note", "_No response_"],
      ["Delist confirmation", "_No response_"],
      ["Owner request manifest", "_No response_"],
    ]
      .map(([heading, value]) => `### ${heading}\n\n${value}`)
      .join("\n\n"),
  };

  await expect(
    processProjectOwnerTriage({
      issue: fallbackIssue,
      record: current,
      repository,
      vocabularies,
    }),
  ).resolves.toMatchObject({
    status: "admitted",
    manifest: {
      project_id: "owner-alpha",
      proposed: { summary: "Fallback owner summary." },
    },
  });
});

test("fails closed when the issue changes during triage", async () => {
  const original = issue();
  const changed = { ...original, updated_at: "2026-07-28T12:01:00Z" };
  const request = vi.fn(async (path: string) =>
    path === "/repositories/42" ? repository : changed,
  );

  await expect(
    processProjectOwnerTriage({
      issue: original,
      record: record(),
      request,
      vocabularies,
    }),
  ).resolves.toMatchObject({
    status: "retryable",
    reasonCode: "issue-changed-during-triage",
  });
});

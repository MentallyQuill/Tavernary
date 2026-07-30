import { resolve } from "node:path";

import { expect, test, vi } from "vitest";

import {
  fingerprintProjectRecord,
  fingerprintSourceRecord,
} from "../../src/features/help/project-owner-record.mjs";
import { processProjectOwnerTriage } from "../../scripts/help/triage-project-owner-request.mjs";

const root = resolve("test-fixtures", "owner-request-repository");
const normalizedRoot = root.replaceAll("\\", "/");
const currentTagVocabularyHash = "f".repeat(64);
const vocabularies = {
  frontends: ["sillytavern"],
  primaryFunctions: ["interface-workflow"],
  tags: [{ id: "automation", applicable_kinds: ["extension"] }],
  modelFamilies: ["claude"],
  completionFormats: ["chat-completion"],
  tagVocabularyHash: currentTagVocabularyHash,
};

function source(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    id: "github-42",
    type: "github",
    repository: "Owner/Alpha",
    repository_id: 42,
    status: "active",
    status_reason: null,
    refresh_policy: "automatic",
    ...overrides,
  };
}

function project(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 6,
    id: "owner-alpha",
    source_id: "github-42",
    name: "Alpha",
    kind: "extension",
    summary: "Original summary.",
    metadata_status: "provisional",
    frontends: ["sillytavern"],
    primary_function: "interface-workflow",
    tags: ["automation"],
    metadata_policy: {
      summary: { mode: "automatic" },
      tags: { mode: "automatic" },
    },
    listing_status: "active",
    listing_status_reason: null,
    ...overrides,
  };
}

function editable(summary = "Owner-authored summary.") {
  return {
    name: "Alpha",
    summary,
    frontends: ["sillytavern"],
    primary_function: "interface-workflow",
    tags: ["automation"],
    metadata: {
      summary: { mode: "manual" },
      tags: { mode: "automatic" },
    },
    model_families: [],
    completion_formats: [],
  };
}

function editManifest(current = project()) {
  return {
    schema_version: 2,
    request_kind: "project-owner",
    operation: "edit-card",
    tag_vocabulary_hash: currentTagVocabularyHash,
    source_id: "github-42",
    project_id: "owner-alpha",
    repository_id: 42,
    project_fingerprint: fingerprintProjectRecord(current),
    original: { kind: "extension", ...editable("Original summary.") },
    proposed: editable(),
    explanation: null,
  };
}

function addManifest(currentSource = source()) {
  return {
    schema_version: 2,
    request_kind: "project-owner",
    operation: "add-cards",
    tag_vocabulary_hash: currentTagVocabularyHash,
    source_id: "github-42",
    repository_id: 42,
    source_fingerprint: fingerprintSourceRecord(currentSource),
    proposed_cards: [
      {
        draft_id: "draft-1",
        project_id: "owner-alpha-beta",
        kind: "extension",
        ...editable("A distinct sibling card."),
        name: "Beta",
      },
    ],
    explanation: "This repository ships two distinct extensions.",
  };
}

function delistManifest(
  currentSource = source(),
  confirmation = "Owner/Alpha",
) {
  return {
    schema_version: 2,
    request_kind: "project-owner",
    operation: "delist-source",
    source_id: "github-42",
    repository_id: 42,
    source_fingerprint: fingerprintSourceRecord(currentSource),
    original: { status: "active" },
    proposed: {
      status: "delisted",
      status_reason: "removed",
      refresh_policy: "paused",
    },
    delist_confirmation: confirmation,
    explanation: null,
  };
}

function issue(bodyManifest: Record<string, unknown> = editManifest()) {
  return {
    number: 123,
    state: "open",
    body: `### Request type

Permanently delist this source

### Source ID

github-999

### Project ID

attacker-project

### Current repository

https://github.com/Attacker/Wrong

### Owner request manifest

\`\`\`json
${JSON.stringify(bodyManifest)}
\`\`\``,
    labels: ["issue-admitted", "project-owner-request"],
    user: { id: 100, login: "Owner" },
    author_association: "NONE",
    url: "https://api.github.com/repos/Attacker/Wrong/issues/123",
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

const trustedEditorRegistry = {
  schema_version: 1 as const,
  editors: [
    {
      github_user_id: 2_625_904,
      login: "MentallyQuill",
      role: "owner" as const,
    },
  ],
};

test("reads card and source records by trusted IDs, resolves immutable GitHub identity, and refreshes the issue", async () => {
  const currentProject = project();
  const currentSource = source();
  const latest = issue();
  const chronology: string[] = [];
  const readFile = vi.fn(async (path: string) => {
    const normalized = path.replaceAll("\\", "/");
    chronology.push(`read:${normalized}`);
    if (normalized.endsWith("/projects/owner-alpha.json")) {
      return JSON.stringify(currentProject);
    }
    if (normalized.endsWith("/sources/github-42.json")) {
      return JSON.stringify(currentSource);
    }
    throw new Error(`unexpected read ${normalized}`);
  });
  const request = vi.fn(async (path: string) => {
    chronology.push(`request:${path}`);
    if (path === "/repositories/42") return repository;
    if (path === "/repos/Tavernary/Tavernary/issues/123") return latest;
    throw new Error(`unexpected request ${path}`);
  });

  await expect(
    processProjectOwnerTriage({
      issue: latest,
      root,
      hostRepository: "Tavernary/Tavernary",
      request,
      readFile,
      vocabularies,
    }),
  ).resolves.toMatchObject({
    status: "admitted",
    issueNumber: 123,
    projectId: "owner-alpha",
    sourceId: "github-42",
    operation: "edit-card",
    verifiedOwnerLogin: "Owner",
    warnings: [],
  });
  expect(chronology).toEqual([
    `read:${normalizedRoot}/data/registry/projects/owner-alpha.json`,
    `read:${normalizedRoot}/data/registry/sources/github-42.json`,
    "request:/repositories/42",
    "request:/repos/Tavernary/Tavernary/issues/123",
  ]);
  expect(request).not.toHaveBeenCalledWith(expect.stringContaining("Attacker"));
});

test("admits a source-scoped add-card batch without requiring a selected card", async () => {
  const currentSource = source();
  const latest = issue(addManifest(currentSource));
  await expect(
    processProjectOwnerTriage({
      issue: latest,
      source: currentSource,
      projects: [project(), project({ id: "owner-alpha-old" })],
      repository,
      hostRepository: "Tavernary/Tavernary",
      request: vi.fn(async () => latest),
      vocabularies,
      issues: [latest],
      pulls: [],
    }),
  ).resolves.toMatchObject({
    status: "admitted",
    projectId: null,
    sourceId: "github-42",
    operation: "add-cards",
    projects: [{ id: "owner-alpha" }, { id: "owner-alpha-old" }],
  });
});

test("rejects a tag-bearing request created against a stale vocabulary hash", async () => {
  const latest = issue({
    ...editManifest(),
    tag_vocabulary_hash: "e".repeat(64),
  });
  await expect(
    processProjectOwnerTriage({
      issue: latest,
      project: project(),
      source: source(),
      repository,
      vocabularies,
    }),
  ).resolves.toMatchObject({
    status: "needs-information",
    reasonCode: "tag-vocabulary-stale",
    message: expect.stringContaining("Rebuild and resubmit"),
  });
});

test("rejects a later unresolved add-card batch for the same immutable source", async () => {
  const currentSource = source();
  const latest = issue(addManifest(currentSource));
  const earlier = {
    ...issue(addManifest(currentSource)),
    number: 122,
  };
  await expect(
    processProjectOwnerTriage({
      issue: latest,
      source: currentSource,
      repository,
      vocabularies,
      issues: [earlier, latest],
      pulls: [],
    }),
  ).resolves.toMatchObject({
    status: "needs-information",
    reasonCode: "source-request-already-open",
    conflictingIssueNumber: 122,
  });
});

test("returns retryable when immutable repository resolution temporarily fails", async () => {
  const temporary = Object.assign(new Error("GitHub unavailable"), {
    status: 503,
  });
  await expect(
    processProjectOwnerTriage({
      issue: issue(),
      project: project(),
      source: source(),
      hostRepository: "Tavernary/Tavernary",
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

test("keeps owner authority limited to the current personal repository owner", async () => {
  const decision = await processProjectOwnerTriage({
    issue: { ...issue(), user: { login: "Contributor" } },
    project: project(),
    source: source(),
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

test("admits trusted staff while still validating source identity", async () => {
  const latest = {
    ...issue(),
    user: { id: 2_625_904, login: "MentallyQuill" },
    author_association: "OWNER",
  };
  const request = vi.fn(async () => latest);
  await expect(
    processProjectOwnerTriage({
      issue: latest,
      project: project(),
      source: source(),
      hostRepository: "Tavernary/Tavernary",
      request,
      vocabularies,
      trustedEditorRegistry,
    }),
  ).resolves.toMatchObject({
    status: "admitted",
    authorityType: "tavernary-staff",
    actorLogin: "MentallyQuill",
    repository: null,
  });
  expect(request).toHaveBeenCalledTimes(1);
});

test("admits trusted staff maintenance for a non-GitHub source", async () => {
  const currentSource = source({
    id: "url-reddit-1v9u18m",
    type: "url",
    repository: undefined,
    repository_id: undefined,
  });
  const currentProject = project({
    id: "reddit-card",
    source_id: currentSource.id,
  });
  const manifest = {
    ...editManifest(currentProject),
    source_id: currentSource.id,
    repository_id: null,
    project_id: currentProject.id,
    project_fingerprint: fingerprintProjectRecord(currentProject),
  };
  const latest = {
    ...issue(manifest),
    user: { id: 2_625_904, login: "MentallyQuill" },
    author_association: "OWNER",
  };
  const request = vi.fn(async () => latest);

  await expect(
    processProjectOwnerTriage({
      issue: latest,
      project: currentProject,
      source: currentSource,
      hostRepository: "Tavernary/Tavernary",
      request,
      vocabularies,
      trustedEditorRegistry,
    }),
  ).resolves.toMatchObject({
    status: "admitted",
    authorityType: "tavernary-staff",
    actorLogin: "MentallyQuill",
  });
});

test("scopes stale checks to the operation target", async () => {
  const changedProject = project({ summary: "Maintainer changed the card." });
  await expect(
    processProjectOwnerTriage({
      issue: issue(),
      project: changedProject,
      source: source(),
      repository,
      vocabularies,
    }),
  ).resolves.toMatchObject({
    status: "needs-information",
    reasonCode: "stale-owner-request",
    fields: ["project_fingerprint"],
  });

  const changedSource = source({ refresh_policy: "paused" });
  await expect(
    processProjectOwnerTriage({
      issue: issue(addManifest()),
      source: changedSource,
      repository,
      vocabularies,
      issues: [],
      pulls: [],
    }),
  ).resolves.toMatchObject({
    status: "needs-information",
    reasonCode: "stale-owner-request",
    fields: ["source_fingerprint"],
  });
});

test("requires repository-wide delisting confirmation", async () => {
  await expect(
    processProjectOwnerTriage({
      issue: issue(delistManifest(source(), "Alpha")),
      source: source(),
      repository,
      vocabularies,
    }),
  ).resolves.toMatchObject({
    status: "needs-information",
    reasonCode: "owner-request-invalid",
    message: expect.stringContaining("match the repository"),
  });
});

test("rejects complete readable owner fields without loading a target", async () => {
  const currentProject = project();
  const fallbackIssue = {
    ...issue(),
    body: [
      ["Request type", "Edit card details"],
      ["Source ID", "github-42"],
      ["Project ID", "owner-alpha"],
      ["Current repository", "https://github.com/Attacker/Wrong"],
      ["Proposed display name", "Alpha"],
      ["Proposed summary", "Fallback owner summary."],
      ["Supported frontends", "sillytavern"],
      ["Primary function", "interface-workflow"],
      ["Tags", "automation"],
      ["Summary metadata mode", "manual"],
      ["Tag metadata mode", "automatic"],
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
  const request = vi.fn(async () => fallbackIssue);
  await expect(
    processProjectOwnerTriage({
      issue: fallbackIssue,
      project: currentProject,
      source: source(),
      repository,
      hostRepository: "Tavernary/Tavernary",
      request,
      vocabularies,
    }),
  ).resolves.toMatchObject({
    status: "needs-information",
    reasonCode: "owner-request-invalid",
    message: expect.stringContaining("complete generated request manifest"),
  });
  expect(request).not.toHaveBeenCalled();
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
      project: project(),
      source: source(),
      hostRepository: "Tavernary/Tavernary",
      request,
      vocabularies,
    }),
  ).resolves.toMatchObject({
    status: "retryable",
    reasonCode: "issue-changed-during-triage",
  });
});

test("refuses admission when trusted issue routing context is unavailable", async () => {
  await expect(
    processProjectOwnerTriage({
      issue: issue(),
      project: project(),
      source: source(),
      repository,
      request: vi.fn(async () => issue()),
      vocabularies,
    }),
  ).resolves.toMatchObject({
    status: "retryable",
    reasonCode: "trusted-issue-context-unavailable",
  });
});

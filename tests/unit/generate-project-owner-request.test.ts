import { resolve } from "node:path";

import { expect, test, vi } from "vitest";

import {
  fingerprintProjectRecord,
  fingerprintSourceRecord,
} from "../../src/features/help/project-owner-record.mjs";
import {
  fingerprintProjectOwnerManifest,
  generateProjectOwnerRequest,
  sameProjectOwnerGenerationReport,
} from "../../scripts/help/generate-project-owner-request.mjs";

const root = resolve("test-fixtures", "owner-request-repository");
const reportPath = resolve(
  "test-fixtures",
  "owner-request-artifacts",
  "owner-123.json",
);
const normalizedRoot = root.replaceAll("\\", "/");
const normalizedReportPath = reportPath.replaceAll("\\", "/");
const projectPath = `${normalizedRoot}/data/registry/projects/owner-alpha.json`;
const sourcePath = `${normalizedRoot}/data/registry/sources/github-42.json`;
const snapshotPath = `${normalizedRoot}/data/snapshots/github/github-42.json`;

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
    cataloged_at: "2025-01-01T00:00:00.000Z",
    catalog_cohort: "standard",
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
  const draft = (draftId: string, name: string, summary: string) => ({
    draft_id: draftId,
    project_id: `owner-alpha-${name.toLocaleLowerCase()}`,
    kind: "extension",
    ...editable(summary),
    name,
  });
  return {
    schema_version: 2,
    request_kind: "project-owner",
    operation: "add-cards",
    source_id: "github-42",
    repository_id: 42,
    source_fingerprint: fingerprintSourceRecord(currentSource),
    proposed_cards: [
      draft("draft-b", "Gamma", "Gamma is distinct."),
      draft("draft-a", "Beta", "Beta is distinct."),
    ],
    explanation: "Two distinct offerings.",
  };
}

function moveManifest(currentSource = source()) {
  return {
    schema_version: 2,
    request_kind: "project-owner",
    operation: "move-source",
    source_id: "github-42",
    repository_id: 42,
    source_fingerprint: fingerprintSourceRecord(currentSource),
    original: { repository: "Owner/Alpha", repository_id: 42 },
    proposed: { repository: "Owner/Alpha-Renamed", repository_id: 42 },
    explanation: null,
  };
}

function delistManifest(currentSource = source()) {
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
    delist_confirmation: "Owner/Alpha",
    explanation: null,
  };
}

function issue(manifest: Record<string, unknown>) {
  return {
    number: 123,
    state: "open",
    body: `### Owner request manifest

\`\`\`json
${JSON.stringify(manifest)}
\`\`\``,
    labels: ["issue-admitted", "project-owner-request"],
    user: { id: 100, login: "Owner" },
    author_association: "NONE",
    updated_at: "2026-07-29T12:00:00Z",
  };
}

function snapshot() {
  return {
    schema_version: 4,
    provider: "github",
    source_id: "github-42",
    repository: {
      id: 42,
      owner: "Owner",
      name: "Alpha",
      url: "https://github.com/Owner/Alpha",
    },
  };
}

const repository = {
  id: 42,
  fullName: "Owner/Alpha",
  htmlUrl: "https://github.com/Owner/Alpha",
  visibility: "public",
  owner: { login: "Owner", type: "User" },
};

function vocabularyFiles() {
  return new Map([
    [
      `${normalizedRoot}/data/vocabularies/frontends.json`,
      JSON.stringify({ frontends: [{ id: "sillytavern" }] }),
    ],
    [
      `${normalizedRoot}/data/vocabularies/primary-functions.json`,
      JSON.stringify({ primary_functions: [{ id: "interface-workflow" }] }),
    ],
    [
      `${normalizedRoot}/data/vocabularies/tags.json`,
      JSON.stringify({
        tags: [{ id: "automation", applicable_kinds: ["extension"] }],
      }),
    ],
    [
      `${normalizedRoot}/data/vocabularies/model-families.json`,
      JSON.stringify({ model_families: [{ id: "claude" }] }),
    ],
    [
      `${normalizedRoot}/data/vocabularies/completion-formats.json`,
      JSON.stringify({ completion_formats: [{ id: "chat-completion" }] }),
    ],
  ]);
}

function harness(
  manifest: Record<string, unknown>,
  options: {
    repository?: Record<string, unknown>;
    failWritePath?: string;
    mutateProjectOnFinalRead?: boolean;
  } = {},
) {
  const latest = issue(manifest);
  const storage = vocabularyFiles();
  storage.set(projectPath, JSON.stringify(project()));
  storage.set(sourcePath, JSON.stringify(source()));
  storage.set(snapshotPath, JSON.stringify(snapshot()));
  let projectReads = 0;
  const reads: string[] = [];
  const writes: string[] = [];
  const removals: string[] = [];
  const readFile = vi.fn(async (path: string) => {
    const normalized = path.replaceAll("\\", "/");
    reads.push(normalized);
    if (normalized === projectPath) {
      projectReads += 1;
      if (options.mutateProjectOnFinalRead && projectReads >= 2) {
        return JSON.stringify(
          project({ summary: "Concurrent maintainer summary." }),
        );
      }
    }
    if (!storage.has(normalized)) {
      throw Object.assign(new Error(`ENOENT ${normalized}`), {
        code: "ENOENT",
      });
    }
    return storage.get(normalized) as string;
  });
  const readdir = vi.fn(async () =>
    [...storage.keys()]
      .filter(
        (path) =>
          path.startsWith(`${normalizedRoot}/data/registry/projects/`) &&
          path.endsWith(".json"),
      )
      .map((path) => path.split("/").at(-1))
      .filter((name): name is string => typeof name === "string"),
  );
  const request = vi.fn(async (path: string) => {
    if (path === "/repos/Tavernary/Tavernary/issues/123") return latest;
    if (
      path ===
      "/repos/Tavernary/Tavernary/issues?state=open&labels=project-owner-request&per_page=100"
    ) {
      return [latest];
    }
    if (path === "/repos/Tavernary/Tavernary/pulls?state=open&per_page=100") {
      return [];
    }
    if (path === "/repositories/42") {
      return { ...repository, ...(options.repository ?? {}) };
    }
    throw new Error(`unexpected request ${path}`);
  });
  const writeFile = vi.fn(async (path: string, value: string) => {
    const normalized = path.replaceAll("\\", "/");
    writes.push(normalized);
    if (normalized === options.failWritePath) throw new Error("write failed");
    storage.set(normalized, value);
  });
  const rm = vi.fn(async (path: string) => {
    const normalized = path.replaceAll("\\", "/");
    removals.push(normalized);
    storage.delete(normalized);
  });
  return {
    latest,
    storage,
    reads,
    writes,
    removals,
    readFile,
    readdir,
    request,
    writeFile,
    rm,
  };
}

async function generate(
  fixture: ReturnType<typeof harness>,
  overrides: Record<string, unknown> = {},
) {
  return generateProjectOwnerRequest({
    issue: fixture.latest,
    hostRepository: "Tavernary/Tavernary",
    root,
    reportPath,
    request: fixture.request,
    readFile: fixture.readFile,
    readdir: fixture.readdir,
    writeFile: fixture.writeFile,
    rm: fixture.rm,
    mkdir: vi.fn(async () => undefined),
    now: "2026-07-29T13:00:00.000Z",
    ...overrides,
  });
}

test("fingerprints every normalized request field", () => {
  const manifest = editManifest();
  expect(fingerprintProjectOwnerManifest(manifest)).toBe(
    fingerprintProjectOwnerManifest(structuredClone(manifest)),
  );
  expect(
    fingerprintProjectOwnerManifest({
      ...manifest,
      explanation: "A public explanation.",
    }),
  ).not.toBe(fingerprintProjectOwnerManifest(manifest));
});

test("compares reports with sorted project arrays while preserving exact source identity", () => {
  const base = {
    schema_version: 2,
    generated_at: "2026-07-29T13:00:00.000Z",
    project_ids: ["b", "a"],
    source_identity: {
      type: "github",
      canonical: "github:42",
      repository_id: 42,
    },
    before: [{ id: "b" }, { id: "a" }],
    after: [{ id: "b" }, { id: "a" }],
  };
  expect(
    sameProjectOwnerGenerationReport(base, {
      ...base,
      generated_at: "2026-07-29T13:05:00.000Z",
      project_ids: ["a", "b"],
      before: [{ id: "a" }, { id: "b" }],
      after: [{ id: "a" }, { id: "b" }],
    }),
  ).toBe(true);
  expect(
    sameProjectOwnerGenerationReport(base, {
      ...base,
      source_identity: { ...base.source_identity, repository_id: 84 },
    }),
  ).toBe(false);
});

test("revalidates and writes one card edit with a card-scoped input fingerprint", async () => {
  const fixture = harness(editManifest());
  const generated = await generate(fixture);
  expect(generated.generatedPaths).toEqual([
    "data/registry/projects/owner-alpha.json",
  ]);
  expect(fixture.writes).toEqual([projectPath, normalizedReportPath]);
  expect(JSON.parse(fixture.storage.get(projectPath) ?? "")).toMatchObject({
    summary: "Owner-authored summary.",
    metadata_policy: {
      summary: {
        mode: "manual",
        note: "Owner-authored summary approved through issue #123.",
      },
      tags: { mode: "automatic" },
    },
  });
  expect(generated.report).toMatchObject({
    schema_version: 2,
    project_ids: ["owner-alpha"],
    source_id: "github-42",
    operation: "edit-card",
    publication_mode: "automatic",
    input_fingerprints: {
      projects: {
        "owner-alpha": expect.stringMatching(/^[a-f0-9]{64}$/u),
      },
      source: null,
    },
  });
});

test("writes a two-card add batch atomically and marks the combined publication manual", async () => {
  const fixture = harness(addManifest());
  const generated = await generate(fixture);
  const betaPath = `${normalizedRoot}/data/registry/projects/owner-alpha-beta.json`;
  const gammaPath = `${normalizedRoot}/data/registry/projects/owner-alpha-gamma.json`;
  expect(generated.generatedPaths).toEqual([
    "data/registry/projects/owner-alpha-beta.json",
    "data/registry/projects/owner-alpha-gamma.json",
  ]);
  expect(fixture.writes).toEqual([betaPath, gammaPath, normalizedReportPath]);
  expect(generated.report).toMatchObject({
    project_ids: ["owner-alpha-beta", "owner-alpha-gamma"],
    source_id: "github-42",
    operation: "add-cards",
    publication_mode: "manual",
    input_fingerprints: {
      projects: {},
      source: expect.stringMatching(/^[a-f0-9]{64}$/u),
    },
  });
  expect(fixture.storage.has(sourcePath)).toBe(true);
  expect(fixture.writes).not.toContain(sourcePath);
});

test("moves only the shared source and source-owned snapshot", async () => {
  const fixture = harness(moveManifest(), {
    repository: {
      fullName: "Owner/Alpha-Renamed",
      htmlUrl: "https://github.com/Owner/Alpha-Renamed",
    },
  });
  const generated = await generate(fixture);
  expect(generated.generatedPaths).toEqual([
    "data/registry/sources/github-42.json",
    "data/snapshots/github/github-42.json",
  ]);
  expect(fixture.writes).toEqual([
    sourcePath,
    snapshotPath,
    normalizedReportPath,
  ]);
  expect(JSON.parse(fixture.storage.get(sourcePath) ?? "")).toMatchObject({
    id: "github-42",
    repository: "Owner/Alpha-Renamed",
    repository_id: 42,
  });
});

test("delists only the shared source while listing all affected cards", async () => {
  const fixture = harness(delistManifest());
  const generated = await generate(fixture);
  expect(generated.generatedPaths).toEqual([
    "data/registry/sources/github-42.json",
  ]);
  expect(generated.report.project_ids).toEqual(["owner-alpha"]);
  expect(JSON.parse(fixture.storage.get(sourcePath) ?? "")).toMatchObject({
    status: "delisted",
    status_reason: "removed",
    refresh_policy: "paused",
  });
  expect(fixture.writes).toEqual([sourcePath, normalizedReportPath]);
});

test("stops without writes when a card changes during final revalidation", async () => {
  const fixture = harness(editManifest(), {
    mutateProjectOnFinalRead: true,
  });
  await expect(generate(fixture)).rejects.toThrow("stale-owner-request");
  expect(fixture.writeFile).not.toHaveBeenCalled();
});

test("rejects a report path inside repository output before any request or write", async () => {
  const fixture = harness(editManifest());
  await expect(
    generate(fixture, { reportPath: resolve(root, "report.json") }),
  ).rejects.toThrow("outside the repository output");
  expect(fixture.request).not.toHaveBeenCalled();
  expect(fixture.writeFile).not.toHaveBeenCalled();
});

test("removes a newly written card when a later file in the batch fails", async () => {
  const betaPath = `${normalizedRoot}/data/registry/projects/owner-alpha-beta.json`;
  const gammaPath = `${normalizedRoot}/data/registry/projects/owner-alpha-gamma.json`;
  const fixture = harness(addManifest(), { failWritePath: gammaPath });
  await expect(generate(fixture)).rejects.toThrow("write failed");
  expect(fixture.storage.has(betaPath)).toBe(false);
  expect(fixture.storage.has(gammaPath)).toBe(false);
  expect(fixture.removals).toContain(betaPath);
  expect(fixture.storage.has(normalizedReportPath)).toBe(false);
});

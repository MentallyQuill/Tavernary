import { resolve } from "node:path";

import { expect, test, vi } from "vitest";

import { fingerprintProjectRecord } from "../../src/features/help/project-owner-record.mjs";
import {
  fingerprintProjectOwnerManifest,
  generateProjectOwnerRequest,
  sameProjectOwnerGenerationReport,
} from "../../scripts/help/generate-project-owner-request.mjs";

const ownerRepositoryRoot = resolve(
  "test-fixtures",
  "owner-request-repository",
);
const ownerReportPath = resolve(
  "test-fixtures",
  "owner-request-artifacts",
  "owner-123.json",
);
const normalizedOwnerRepositoryRoot = ownerRepositoryRoot.replaceAll("\\", "/");
const normalizedOwnerReportPath = ownerReportPath.replaceAll("\\", "/");
const ownerRegistryPath = `${normalizedOwnerRepositoryRoot}/data/registry/projects/owner-alpha.json`;
const ownerSnapshotPath = `${normalizedOwnerRepositoryRoot}/data/snapshots/github/owner-alpha.json`;

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
    catalog_cohort: "standard",
    ...overrides,
  };
}

function editManifest(current = record()) {
  return {
    schema_version: 1 as const,
    request_kind: "project-owner",
    operation: "edit-card" as const,
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

function issue(manifest: Record<string, unknown> = editManifest()) {
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
    url: "https://api.github.com/repos/Attacker/Wrong/issues/123",
    updated_at: "2026-07-28T12:00:00Z",
  };
}

const repository = {
  id: 42,
  full_name: "Owner/Alpha",
  html_url: "https://github.com/Owner/Alpha",
  visibility: "public",
  owner: { login: "Owner", type: "User" },
};

function vocabularyJson(path: string) {
  if (path.endsWith("frontends.json"))
    return JSON.stringify({ frontends: [{ id: "sillytavern" }] });
  if (path.endsWith("primary-functions.json"))
    return JSON.stringify({
      primary_functions: [{ id: "interface-workflow" }],
    });
  if (path.endsWith("capabilities.json"))
    return JSON.stringify({ capabilities: [{ id: "automation" }] });
  if (path.endsWith("model-families.json"))
    return JSON.stringify({ model_families: [{ id: "claude" }] });
  if (path.endsWith("completion-formats.json"))
    return JSON.stringify({
      completion_formats: [{ id: "chat-completion" }],
    });
  return null;
}

function harness(
  options: {
    records?: Record<string, unknown>[];
    manifest?: Record<string, unknown>;
  } = {},
) {
  const records = options.records ?? [record(), record()];
  const latest = issue(options.manifest ?? editManifest());
  let recordRead = 0;
  const events: string[] = [];
  const readFile = vi.fn(async (path: string) => {
    const normalized = path.replaceAll("\\", "/");
    const vocabulary = vocabularyJson(normalized);
    if (vocabulary !== null) return vocabulary;
    if (normalized.endsWith("/data/registry/projects/owner-alpha.json")) {
      events.push(`read-record-${recordRead + 1}`);
      return JSON.stringify(
        records[Math.min(recordRead++, records.length - 1)],
      );
    }
    throw new Error(`unexpected read ${normalized}`);
  });
  const request = vi.fn(async (path: string) => {
    events.push(`request:${path}`);
    if (path === "/repositories/42") return repository;
    if (path === "/repos/Tavernary/Tavernary/issues/123") return latest;
    throw new Error(`unexpected request ${path}`);
  });
  const writes: Array<{ path: string; value: string }> = [];
  const writeFile = vi.fn(async (path: string, value: string) => {
    events.push(`write:${path.replaceAll("\\", "/")}`);
    writes.push({ path: path.replaceAll("\\", "/"), value });
  });
  return { latest, request, readFile, writeFile, writes, events };
}

function sourceMoveTransactionHarness({
  failPath,
  rollbackFailPath,
}: {
  failPath: string;
  rollbackFailPath?: string;
}) {
  const current = record();
  const moveManifest = {
    schema_version: 1,
    request_kind: "project-owner",
    operation: "move-source",
    project_id: "owner-alpha",
    repository_id: 42,
    source_fingerprint: fingerprintProjectRecord(current),
    original: { repository: "Owner/Alpha", repository_id: 42 },
    proposed: { repository: "Owner/Alpha-Renamed", repository_id: 42 },
    explanation: null,
  };
  const latest = issue(moveManifest);
  const snapshot = {
    schema_version: 3,
    provider: "github",
    project_id: "owner-alpha",
    repository: {
      id: 42,
      owner: "Owner",
      name: "Alpha",
      url: "https://github.com/Owner/Alpha",
    },
  };
  const registryPath = ownerRegistryPath;
  const snapshotPath = ownerSnapshotPath;
  const reportPath = normalizedOwnerReportPath;
  const registryPrior = `${JSON.stringify(current, null, 4)}\r\n`;
  const snapshotPrior = `${JSON.stringify(snapshot, null, 2)}\n`;
  const storage = new Map([
    [registryPath, registryPrior],
    [snapshotPath, snapshotPrior],
  ]);
  const attempts = new Map<string, number>();
  const writes: string[] = [];
  const readFile = vi.fn(async (path: string) => {
    const normalized = path.replaceAll("\\", "/");
    const vocabulary = vocabularyJson(normalized);
    if (vocabulary !== null) return vocabulary;
    const value = storage.get(normalized);
    if (value === undefined) throw new Error(`unexpected read ${normalized}`);
    return value;
  });
  const writeFile = vi.fn(async (path: string, value: string) => {
    const normalized = path.replaceAll("\\", "/");
    const attempt = (attempts.get(normalized) ?? 0) + 1;
    attempts.set(normalized, attempt);
    writes.push(`${normalized}#${attempt}`);
    if (normalized === rollbackFailPath && attempt === 2) {
      throw new Error(`rollback failed for ${normalized}`);
    }
    storage.set(normalized, value);
    if (normalized === failPath && attempt === 1) {
      throw new Error(`write failed for ${normalized}`);
    }
  });
  const request = vi.fn(async (path: string) => {
    if (path === "/repositories/42") {
      return {
        ...repository,
        full_name: "Owner/Alpha-Renamed",
        html_url: "https://github.com/Owner/Alpha-Renamed",
      };
    }
    if (path === "/repos/Tavernary/Tavernary/issues/123") return latest;
    throw new Error(`unexpected request ${path}`);
  });
  return {
    latest,
    readFile,
    writeFile,
    request,
    storage,
    writes,
    registryPath,
    snapshotPath,
    reportPath,
    registryPrior,
    snapshotPrior,
  };
}

test("fingerprints every normalized request field including proposal and explanation", () => {
  const manifest = editManifest();
  const changedSummary = {
    ...manifest,
    proposed: {
      ...manifest.proposed,
      summary: "A later owner summary.",
    },
  };
  const changedExplanation = {
    ...manifest,
    explanation: "A later public explanation.",
  };

  expect(fingerprintProjectOwnerManifest(manifest)).toBe(
    fingerprintProjectOwnerManifest(structuredClone(manifest)),
  );
  expect(fingerprintProjectOwnerManifest(changedSummary)).not.toBe(
    fingerprintProjectOwnerManifest(manifest),
  );
  expect(fingerprintProjectOwnerManifest(changedExplanation)).not.toBe(
    fingerprintProjectOwnerManifest(manifest),
  );
});

test("accepts only an equivalent freshly regenerated owner report", () => {
  const validated = {
    schema_version: 1 as const,
    issue_number: 123,
    project_id: "owner-alpha",
    operation: "edit-card" as const,
    repository_id: 42,
    authority_type: "repository-owner" as const,
    actor_login: "Owner",
    request_fingerprint: "a".repeat(64),
    generated_at: "2026-07-28T13:00:00.000Z",
    before: { summary: "Original summary." },
    after: { summary: "Owner-authored summary." },
    warnings: [],
    generated_paths: ["data/registry/projects/owner-alpha.json"],
  };

  expect(
    sameProjectOwnerGenerationReport(validated, {
      ...validated,
      generated_at: "2026-07-28T13:05:00.000Z",
    }),
  ).toBe(true);
  expect(
    sameProjectOwnerGenerationReport(validated, {
      ...validated,
      request_fingerprint: "b".repeat(64),
    }),
  ).toBe(false);
  expect(
    sameProjectOwnerGenerationReport(validated, {
      ...validated,
      after: { summary: "A later owner summary." },
    }),
  ).toBe(false);
});

test("revalidates latest authority and state before writing only the approved registry path", async () => {
  const fixture = harness();

  const generated = await generateProjectOwnerRequest({
    issue: fixture.latest,
    hostRepository: "Tavernary/Tavernary",
    root: ownerRepositoryRoot,
    reportPath: ownerReportPath,
    request: fixture.request,
    readFile: fixture.readFile,
    writeFile: fixture.writeFile,
    now: "2026-07-28T13:00:00.000Z",
  });

  expect(generated.generatedPaths).toEqual([
    "data/registry/projects/owner-alpha.json",
  ]);
  expect(fixture.writes.map(({ path }) => path)).toEqual([
    ownerRegistryPath,
    normalizedOwnerReportPath,
  ]);
  expect(JSON.parse(fixture.writes[0].value)).toMatchObject({
    summary: "Owner-authored summary.",
    enrichment_policy: "manual",
    refresh_policy: "automatic",
  });
  expect(fixture.writes[0].value.endsWith("\n")).toBe(true);
  expect(JSON.parse(fixture.writes[1].value)).toEqual({
    schema_version: 1,
    issue_number: 123,
    project_id: "owner-alpha",
    operation: "edit-card",
    repository_id: 42,
    authority_type: "repository-owner",
    actor_login: "Owner",
    request_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u),
    generated_at: "2026-07-28T13:00:00.000Z",
    before: expect.any(Object),
    after: expect.any(Object),
    warnings: [],
    generated_paths: ["data/registry/projects/owner-alpha.json"],
  });
  expect(fixture.events.lastIndexOf("read-record-2")).toBeLessThan(
    fixture.events.findIndex((event) => event.startsWith("write:")),
  );
  expect(
    fixture.events.filter((event) => event === "request:/repositories/42"),
  ).toHaveLength(2);
  expect(JSON.stringify(fixture.events)).not.toContain("Attacker/Wrong");
  expect(JSON.stringify(fixture.writes)).not.toContain(
    "src/generated/catalog.json",
  );
});

test("revalidates a trusted staff edit without resolving repository identity", async () => {
  const current = record({
    source: { type: "url", url: "https://example.com/alpha" },
  });
  const staffManifest = {
    ...editManifest(current),
    repository_id: null,
  };
  const latest = {
    ...issue(staffManifest),
    user: { id: 2_625_904, login: "MentallyQuill" },
    author_association: "OWNER",
  };
  const readFile = vi.fn(async (path: string) => {
    const normalized = path.replaceAll("\\", "/");
    const vocabulary = vocabularyJson(normalized);
    if (vocabulary !== null) return vocabulary;
    if (normalized.endsWith("/data/registry/projects/owner-alpha.json")) {
      return JSON.stringify(current);
    }
    throw new Error(`unexpected read ${normalized}`);
  });
  const request = vi.fn(async (path: string) => {
    if (path === "/repos/Tavernary/Tavernary/issues/123") return latest;
    throw new Error(`unexpected request ${path}`);
  });
  const writes: Array<{ path: string; value: string }> = [];

  const generated = await generateProjectOwnerRequest({
    issue: latest,
    hostRepository: "Tavernary/Tavernary",
    root: ownerRepositoryRoot,
    reportPath: ownerReportPath,
    request,
    readFile,
    writeFile: vi.fn(async (path: string, value: string) => {
      writes.push({ path: path.replaceAll("\\", "/"), value });
    }),
    now: "2026-07-28T13:00:00.000Z",
  });

  expect(generated).toMatchObject({
    authorityType: "tavernary-staff",
    actorLogin: "MentallyQuill",
    report: {
      repository_id: null,
      authority_type: "tavernary-staff",
      actor_login: "MentallyQuill",
    },
  });
  expect(request).not.toHaveBeenCalledWith(
    expect.stringContaining("repositories"),
  );
  expect(JSON.parse(writes[0].value)).toMatchObject({
    source: { type: "url", url: "https://example.com/alpha" },
    summary: "Owner-authored summary.",
  });
});

test("stops without writes when an overlapping value changes before final apply", async () => {
  const fixture = harness({
    records: [record(), record({ summary: "Concurrent maintainer summary." })],
  });

  await expect(
    generateProjectOwnerRequest({
      issue: fixture.latest,
      hostRepository: "Tavernary/Tavernary",
      root: ownerRepositoryRoot,
      reportPath: ownerReportPath,
      request: fixture.request,
      readFile: fixture.readFile,
      writeFile: fixture.writeFile,
      now: "2026-07-28T13:00:00.000Z",
    }),
  ).rejects.toThrow("stale-owner-request");
  expect(fixture.writeFile).not.toHaveBeenCalled();
});

test("preserves a final non-overlap change and reports the fingerprint warning", async () => {
  const fixture = harness({
    records: [record(), record({ catalog_cohort: "current" })],
  });

  const generated = await generateProjectOwnerRequest({
    issue: fixture.latest,
    hostRepository: "Tavernary/Tavernary",
    root: ownerRepositoryRoot,
    reportPath: ownerReportPath,
    request: fixture.request,
    readFile: fixture.readFile,
    writeFile: fixture.writeFile,
    now: "2026-07-28T13:00:00.000Z",
  });

  expect(generated.report.warnings).toEqual(["source-fingerprint-changed"]);
  expect(JSON.parse(fixture.writes[0].value)).toMatchObject({
    catalog_cohort: "current",
    summary: "Owner-authored summary.",
  });
});

test("rejects a report path inside repository output before any write", async () => {
  const fixture = harness();

  await expect(
    generateProjectOwnerRequest({
      issue: fixture.latest,
      hostRepository: "Tavernary/Tavernary",
      root: ownerRepositoryRoot,
      reportPath: resolve(ownerRepositoryRoot, "report.json"),
      request: fixture.request,
      readFile: fixture.readFile,
      writeFile: fixture.writeFile,
      now: "2026-07-28T13:00:00.000Z",
    }),
  ).rejects.toThrow("outside the repository output");
  expect(fixture.writeFile).not.toHaveBeenCalled();
});

test("writes the matching snapshot only for a same-ID source move", async () => {
  const current = record();
  const moveManifest = {
    schema_version: 1,
    request_kind: "project-owner",
    operation: "move-source",
    project_id: "owner-alpha",
    repository_id: 42,
    source_fingerprint: fingerprintProjectRecord(current),
    original: { repository: "Owner/Alpha", repository_id: 42 },
    proposed: { repository: "Owner/Alpha-Renamed", repository_id: 42 },
    explanation: null,
  };
  const fixture = harness({ manifest: moveManifest });
  const snapshot = {
    schema_version: 3,
    provider: "github",
    project_id: "owner-alpha",
    repository: {
      id: 42,
      owner: "Owner",
      name: "Alpha",
      url: "https://github.com/Owner/Alpha",
    },
  };
  fixture.readFile.mockImplementation(async (path: string) => {
    const normalized = path.replaceAll("\\", "/");
    const vocabulary = vocabularyJson(normalized);
    if (vocabulary !== null) return vocabulary;
    if (normalized.endsWith("/data/registry/projects/owner-alpha.json"))
      return JSON.stringify(current);
    if (normalized.endsWith("/data/snapshots/github/owner-alpha.json"))
      return JSON.stringify(snapshot);
    throw new Error(`unexpected read ${normalized}`);
  });
  fixture.request.mockImplementation(async (path: string) => {
    if (path === "/repositories/42") {
      return {
        ...repository,
        full_name: "Owner/Alpha-Renamed",
        html_url: "https://github.com/Owner/Alpha-Renamed",
      };
    }
    return fixture.latest;
  });

  const generated = await generateProjectOwnerRequest({
    issue: fixture.latest,
    hostRepository: "Tavernary/Tavernary",
    root: ownerRepositoryRoot,
    reportPath: ownerReportPath,
    request: fixture.request,
    readFile: fixture.readFile,
    writeFile: fixture.writeFile,
    now: "2026-07-28T13:00:00.000Z",
  });

  expect(generated.generatedPaths).toEqual([
    "data/registry/projects/owner-alpha.json",
    "data/snapshots/github/owner-alpha.json",
  ]);
  expect(fixture.writes.map(({ path }) => path)).toEqual([
    ownerRegistryPath,
    ownerSnapshotPath,
    normalizedOwnerReportPath,
  ]);
});

test("rejects generation without trusted host repository context", async () => {
  const fixture = harness();

  await expect(
    generateProjectOwnerRequest({
      issue: fixture.latest,
      root: ownerRepositoryRoot,
      reportPath: ownerReportPath,
      request: fixture.request,
      readFile: fixture.readFile,
      writeFile: fixture.writeFile,
      now: "2026-07-28T13:00:00.000Z",
    }),
  ).rejects.toThrow("trusted host repository");
  expect(fixture.request).not.toHaveBeenCalled();
});

test("restores exact prior repository bytes when the snapshot write fails", async () => {
  const fixture = sourceMoveTransactionHarness({
    failPath: ownerSnapshotPath,
  });

  await expect(
    generateProjectOwnerRequest({
      issue: fixture.latest,
      hostRepository: "Tavernary/Tavernary",
      root: ownerRepositoryRoot,
      reportPath: fixture.reportPath,
      request: fixture.request,
      readFile: fixture.readFile,
      writeFile: fixture.writeFile,
      now: "2026-07-28T13:00:00.000Z",
    }),
  ).rejects.toThrow("write failed");

  expect(fixture.storage.get(fixture.registryPath)).toBe(fixture.registryPrior);
  expect(fixture.storage.get(fixture.snapshotPath)).toBe(fixture.snapshotPrior);
  expect(fixture.storage.has(fixture.reportPath)).toBe(false);
  expect(fixture.writes).toEqual([
    `${fixture.registryPath}#1`,
    `${fixture.snapshotPath}#1`,
    `${fixture.snapshotPath}#2`,
    `${fixture.registryPath}#2`,
  ]);
});

test("rolls back every canonical file when the outside report write fails", async () => {
  const fixture = sourceMoveTransactionHarness({
    failPath: normalizedOwnerReportPath,
  });

  await expect(
    generateProjectOwnerRequest({
      issue: fixture.latest,
      hostRepository: "Tavernary/Tavernary",
      root: ownerRepositoryRoot,
      reportPath: fixture.reportPath,
      request: fixture.request,
      readFile: fixture.readFile,
      writeFile: fixture.writeFile,
      now: "2026-07-28T13:00:00.000Z",
    }),
  ).rejects.toThrow("write failed");

  expect(fixture.storage.get(fixture.registryPath)).toBe(fixture.registryPrior);
  expect(fixture.storage.get(fixture.snapshotPath)).toBe(fixture.snapshotPrior);
  expect(fixture.writes.slice(-2)).toEqual([
    `${fixture.snapshotPath}#2`,
    `${fixture.registryPath}#2`,
  ]);
});

test("attempts every restoration and surfaces rollback failure", async () => {
  const fixture = sourceMoveTransactionHarness({
    failPath: normalizedOwnerReportPath,
    rollbackFailPath: ownerSnapshotPath,
  });

  await expect(
    generateProjectOwnerRequest({
      issue: fixture.latest,
      hostRepository: "Tavernary/Tavernary",
      root: ownerRepositoryRoot,
      reportPath: fixture.reportPath,
      request: fixture.request,
      readFile: fixture.readFile,
      writeFile: fixture.writeFile,
      now: "2026-07-28T13:00:00.000Z",
    }),
  ).rejects.toMatchObject({
    code: "owner-generation-rollback-failed",
    message: expect.stringContaining("rollback failed"),
  });

  expect(fixture.storage.get(fixture.registryPath)).toBe(fixture.registryPrior);
  expect(fixture.writes.slice(-2)).toEqual([
    `${fixture.snapshotPath}#2`,
    `${fixture.registryPath}#2`,
  ]);
});

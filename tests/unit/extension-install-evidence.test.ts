import { describe, expect, it, vi } from "vitest";

import {
  deriveExtensionInstallEvidence,
  refreshExtensionInstallEvidence,
} from "../../scripts/catalog/extension-install-evidence.mjs";

const repository = {
  provider: "github" as const,
  repositoryUrl: "https://github.com/example/alpha",
  defaultBranch: "main",
  headSha: "a".repeat(40),
};

describe("deriveExtensionInstallEvidence", () => {
  it("accepts a repository-root SillyTavern manifest", () => {
    expect(
      deriveExtensionInstallEvidence({
        sourceId: "github-42",
        repository,
        manifestPath: "manifest.json",
        manifest: {
          display_name: "Alpha",
          key: "alpha",
          loading_order: 10,
          js: "index.js",
        },
        observedAt: "2026-08-18T12:00:00.000Z",
      }),
    ).toMatchObject({
      schema_version: 1,
      source_id: "github-42",
      head_sha: "a".repeat(40),
      manifest_path: "manifest.json",
      status: "verified",
      folder_name: "alpha",
    });
  });

  it("accepts a manifest without a loading order", () => {
    expect(
      deriveExtensionInstallEvidence({
        sourceId: "github-42",
        repository,
        manifestPath: "manifest.json",
        manifest: {
          display_name: "Character Library",
          js: "index.js",
        },
        observedAt: "2026-08-18T12:00:00.000Z",
      }),
    ).toMatchObject({
      schema_version: 1,
      source_id: "github-42",
      head_sha: "a".repeat(40),
      manifest_path: "manifest.json",
      status: "verified",
      folder_name: "alpha",
    });
  });

  it("rejects a non-numeric loading order when present", () => {
    expect(
      deriveExtensionInstallEvidence({
        sourceId: "github-42",
        repository,
        manifestPath: "manifest.json",
        manifest: {
          display_name: "Alpha",
          loading_order: "first",
          js: "index.js",
        },
        observedAt: "2026-08-18T12:00:00.000Z",
      }),
    ).toMatchObject({ status: "unavailable", reason: "invalid-manifest" });
  });

  it.each([
    ["nested manifest", "extension/manifest.json", "manifest-not-at-root"],
    ["missing js", "manifest.json", "invalid-manifest"],
  ])("rejects %s", (_label, manifestPath, reason) => {
    expect(
      deriveExtensionInstallEvidence({
        sourceId: "github-42",
        repository,
        manifestPath,
        manifest: { display_name: "Alpha", key: "alpha" },
        observedAt: "2026-08-18T12:00:00.000Z",
      }),
    ).toMatchObject({ status: "unavailable", reason });
  });
});

it("fetches only active SillyTavern extension manifests at the snapshot head", async () => {
  const readRootFile = vi.fn().mockResolvedValue({
    path: "manifest.json",
    encoding: "utf8",
    content: JSON.stringify({
      display_name: "Alpha",
      loading_order: 10,
      js: "index.js",
    }),
  });
  const snapshot = {
    provider: "github",
    source_id: "github-42",
    source_health: "healthy",
    repository: {
      url: "https://github.com/example/alpha",
      default_branch: "main",
      head_sha: "a".repeat(40),
    },
  };
  const result = await refreshExtensionInstallEvidence({
    projects: [
      {
        source_id: "github-42",
        kind: "extension",
        frontends: ["sillytavern"],
        listing_status: "active",
      },
      {
        source_id: "github-99",
        kind: "preset",
        frontends: ["sillytavern"],
        listing_status: "active",
      },
    ],
    sources: [
      {
        id: "github-42",
        type: "github",
        repository: "example/alpha",
        status: "active",
      },
      {
        id: "github-99",
        type: "github",
        repository: "example/preset",
        status: "active",
      },
    ],
    snapshots: [snapshot],
    previousEvidence: [],
    providers: { github: { readRootFile } },
    observedAt: "2026-08-18T12:00:00.000Z",
  });

  expect(readRootFile).toHaveBeenCalledWith({
    repository: "example/alpha",
    ref: "a".repeat(40),
    path: "manifest.json",
  });
  expect(result.evidence).toEqual([
    expect.objectContaining({ source_id: "github-42", status: "verified" }),
  ]);
});

it("refreshes verified evidence when a repository rename keeps the same head SHA", async () => {
  const readRootFile = vi.fn().mockResolvedValue({
    path: "manifest.json",
    encoding: "utf8",
    content: JSON.stringify({
      display_name: "Renamed",
      loading_order: 10,
      js: "index.js",
    }),
  });
  const result = await refreshExtensionInstallEvidence({
    projects: [
      {
        source_id: "github-42",
        kind: "extension",
        frontends: ["sillytavern"],
        listing_status: "active",
      },
    ],
    sources: [
      {
        id: "github-42",
        type: "github",
        repository: "example/renamed",
        status: "active",
      },
    ],
    snapshots: [
      {
        provider: "github",
        source_id: "github-42",
        source_health: "healthy",
        repository: {
          url: "https://github.com/example/renamed",
          default_branch: "main",
          head_sha: "a".repeat(40),
        },
      },
    ],
    previousEvidence: [
      {
        schema_version: 1,
        source_id: "github-42",
        head_sha: "a".repeat(40),
        observed_at: "2026-08-18T11:00:00.000Z",
        status: "verified",
        manifest_path: "manifest.json",
        folder_name: "alpha",
        manifest: {
          display_name: "Alpha",
          key: null,
          minimum_client_version: null,
        },
      },
    ],
    providers: { github: { readRootFile } },
    observedAt: "2026-08-18T12:00:00.000Z",
  });

  expect(readRootFile).toHaveBeenCalledOnce();
  expect(result.evidence).toContainEqual(
    expect.objectContaining({ source_id: "github-42", folder_name: "renamed" }),
  );
});

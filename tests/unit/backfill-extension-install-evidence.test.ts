import { describe, expect, it, vi } from "vitest";

import {
  backfillExtensionInstallEvidence,
  parseBackfillExtensionInstallEvidenceCli,
} from "../../scripts/catalog/backfill-extension-install-evidence.mjs";

describe("backfillExtensionInstallEvidence", () => {
  it("parses one or more targeted source IDs", () => {
    expect(
      parseBackfillExtensionInstallEvidenceCli([
        "--source-id",
        "github-1",
        "--source-id",
        "codeberg-2",
      ]),
    ).toEqual({ sourceIds: ["github-1", "codeberg-2"] });
    expect(() =>
      parseBackfillExtensionInstallEvidenceCli(["--unknown", "github-1"]),
    ).toThrow("Unknown or incomplete option: --unknown.");
  });

  it("revalidates cached invalid manifests before publishing", async () => {
    const publish = vi.fn();
    const validate = vi.fn().mockResolvedValue({ errors: [] });
    const build = vi.fn().mockResolvedValue({});
    const result = await backfillExtensionInstallEvidence({
      inputs: {
        projects: [
          {
            id: "alpha",
            source_id: "github-1",
            kind: "extension",
            frontends: ["sillytavern"],
            listing_status: "active",
          },
        ],
        sources: [
          {
            id: "github-1",
            type: "github",
            status: "active",
            repository: "example/alpha",
          },
        ],
        snapshots: [
          {
            source_id: "github-1",
            provider: "github",
            source_health: "healthy",
            stale_since: null,
            repository: {
              url: "https://github.com/example/alpha",
              name: "alpha",
              default_branch: "main",
              head_sha: "a".repeat(40),
            },
          },
        ],
        installEvidence: [
          {
            schema_version: 1,
            source_id: "github-1",
            head_sha: "a".repeat(40),
            observed_at: "2026-08-17T12:00:00.000Z",
            status: "unavailable",
            reason: "invalid-manifest",
          },
        ],
      },
      providers: {
        github: {
          readRootFile: vi.fn().mockResolvedValue({
            path: "manifest.json",
            content: JSON.stringify({
              display_name: "Alpha",
              js: "index.js",
            }),
            encoding: "utf8",
          }),
        },
      },
      observedAt: "2026-08-18T12:00:00.000Z",
      validate,
      build,
      publish,
    });

    expect(result).toMatchObject({ changed: 1, verified: 1, unavailable: 0 });
    expect(validate).toHaveBeenCalledBefore(build);
    expect(build).toHaveBeenCalledBefore(publish);
    expect(publish).toHaveBeenCalledWith([
      expect.objectContaining({ source_id: "github-1", status: "verified" }),
    ]);
  });

  it("limits a submission backfill to the requested source", async () => {
    const publish = vi.fn();
    const project = {
      id: "alpha",
      source_id: "github-1",
      kind: "extension",
      frontends: ["sillytavern"],
      listing_status: "active",
    };
    const source = {
      id: "github-1",
      type: "github",
      status: "active",
      repository: "example/alpha",
    };
    const snapshot = {
      source_id: "github-1",
      provider: "github",
      source_health: "healthy",
      stale_since: null,
      repository: {
        url: "https://github.com/example/alpha",
        name: "alpha",
        default_branch: "main",
        head_sha: "a".repeat(40),
      },
    };

    const result = await backfillExtensionInstallEvidence({
      inputs: {
        projects: [project, { ...project, id: "beta", source_id: "github-2" }],
        sources: [
          source,
          { ...source, id: "github-2", repository: "example/beta" },
        ],
        snapshots: [
          snapshot,
          {
            ...snapshot,
            source_id: "github-2",
            repository: {
              ...snapshot.repository,
              url: "https://github.com/example/beta",
              name: "beta",
              head_sha: "b".repeat(40),
            },
          },
        ],
        installEvidence: [],
      },
      sourceIds: ["github-1"],
      providers: {
        github: {
          readRootFile: vi.fn().mockResolvedValue({
            path: "manifest.json",
            content: JSON.stringify({
              display_name: "Extension",
              js: "index.js",
            }),
            encoding: "utf8",
          }),
        },
      },
      observedAt: "2026-08-21T02:00:00.000Z",
      validate: vi.fn().mockResolvedValue({ errors: [] }),
      build: vi.fn().mockResolvedValue({}),
      publish,
    });

    expect(result).toMatchObject({ changed: 1, verified: 1, unavailable: 0 });
    expect(publish).toHaveBeenCalledWith([
      expect.objectContaining({ source_id: "github-1", status: "verified" }),
    ]);
  });
});

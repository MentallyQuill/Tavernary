import { describe, expect, it, vi } from "vitest";

import { backfillExtensionInstallEvidence } from "../../scripts/catalog/backfill-extension-install-evidence.mjs";

describe("backfillExtensionInstallEvidence", () => {
  it("validates and builds all current-head evidence before publishing", async () => {
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
        installEvidence: [],
      },
      providers: {
        github: {
          readRootFile: vi.fn().mockResolvedValue({
            path: "manifest.json",
            content: JSON.stringify({
              display_name: "Alpha",
              loading_order: 10,
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
});

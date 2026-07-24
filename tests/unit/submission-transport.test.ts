import { beforeEach, expect, test, vi } from "vitest";

import {
  openKitSubmission,
  serializeKitManifest,
} from "@/features/kits/submission-transport";

const draft = {
  operation: "create" as const,
  kitId: null,
  title: "Story Kit",
  description: "A complete roleplay stack.",
  projectIds: ["frontend", "memory", "lore"],
};

beforeEach(() => {
  vi.restoreAllMocks();
});

test("serializes a stable pretty manifest using submission field names", () => {
  expect(serializeKitManifest(draft)).toBe(
    JSON.stringify(
      {
        operation: "create",
        kit_id: null,
        title: "Story Kit",
        description: "A complete roleplay stack.",
        project_ids: ["frontend", "memory", "lore"],
      },
      null,
      2,
    ),
  );
});

test("prefills short manifests without invoking native share", async () => {
  const open = vi.spyOn(window, "open").mockImplementation(() => null);
  const share = vi.fn();
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: share,
  });

  await expect(
    openKitSubmission("https://github.com/example/repo/issues/new", "short"),
  ).resolves.toBe("prefilled");

  const opened = new URL(String(open.mock.calls[0]?.[0]));
  expect(opened.searchParams.get("manifest")).toBe("short");
  expect(open.mock.calls[0]?.slice(1)).toEqual([
    "_blank",
    "noopener,noreferrer",
  ]);
  expect(share).not.toHaveBeenCalled();
});

test("copies oversized manifests and opens paste instructions", async () => {
  const open = vi.spyOn(window, "open").mockImplementation(() => null);
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  const manifest = "x".repeat(7_100);

  await expect(
    openKitSubmission("https://github.com/example/repo/issues/new", manifest),
  ).resolves.toBe("clipboard");

  expect(writeText).toHaveBeenCalledWith(manifest);
  const opened = new URL(String(open.mock.calls[0]?.[0]));
  expect(opened.searchParams.get("manifest")).toBe(
    "Paste the Kit manifest copied by Tavernary here.",
  );
});

test("offers selectable text when clipboard access fails", async () => {
  vi.spyOn(window, "open").mockImplementation(() => null);
  const prompt = vi.spyOn(window, "prompt").mockImplementation(() => null);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
  });
  const manifest = "x".repeat(7_100);

  await expect(
    openKitSubmission("https://github.com/example/repo/issues/new", manifest),
  ).resolves.toBe("clipboard");
  expect(prompt).toHaveBeenCalledWith(
    "Copy this Kit manifest, then paste it into the GitHub form:",
    manifest,
  );
});

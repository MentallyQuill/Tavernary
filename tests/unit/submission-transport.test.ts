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

test("prefills a readable create submission from the Kit draft", async () => {
  const open = vi.spyOn(window, "open").mockReturnValue(window);
  const share = vi.fn();
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: share,
  });

  await expect(
    openKitSubmission(
      "https://github.com/example/repo/issues/new?template=05-kit-submission.yml",
      draft,
    ),
  ).resolves.toMatchObject({ mode: "prefilled" });

  const opened = new URL(String(open.mock.calls[0]?.[0]));
  expect(opened.searchParams.get("template")).toBe("05-kit-submission.yml");
  expect(opened.searchParams.get("title")).toBe("[Kit submission]: Story Kit");
  expect(opened.searchParams.get("kit-title")).toBe("Story Kit");
  expect(opened.searchParams.get("kit-description")).toBe(
    "A complete roleplay stack.",
  );
  expect(opened.searchParams.get("manifest")).toBe(serializeKitManifest(draft));
  expect(open.mock.calls[0]?.slice(1)).toEqual([
    "_blank",
    "noopener,noreferrer",
  ]);
  expect(share).not.toHaveBeenCalled();
});

test("prefills edit identity through the generated manifest", async () => {
  const open = vi.spyOn(window, "open").mockReturnValue(window);
  const editDraft = {
    ...draft,
    operation: "edit" as const,
    kitId: "story-kit-41",
    title: " Revised Story Kit ",
    description: " Revised description. ",
  };

  await openKitSubmission(
    "https://github.com/example/repo/issues/new",
    editDraft,
  );

  const opened = new URL(String(open.mock.calls[0]?.[0]));
  expect(opened.searchParams.get("title")).toBe(
    "[Kit submission]: Revised Story Kit",
  );
  expect(opened.searchParams.get("kit-title")).toBe("Revised Story Kit");
  expect(opened.searchParams.get("kit-description")).toBe(
    "Revised description.",
  );
  expect(JSON.parse(opened.searchParams.get("manifest") ?? "")).toMatchObject({
    operation: "edit",
    kit_id: "story-kit-41",
  });
  expect(opened.searchParams.has("operation")).toBe(false);
  expect(opened.searchParams.has("kit-id")).toBe(false);
});

test("copies oversized manifests while preserving readable prefills", async () => {
  const open = vi.spyOn(window, "open").mockReturnValue(window);
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  const oversizedDraft = {
    ...draft,
    projectIds: ["x".repeat(7_100)],
  };
  const manifest = serializeKitManifest(oversizedDraft);

  await expect(
    openKitSubmission(
      "https://github.com/example/repo/issues/new",
      oversizedDraft,
    ),
  ).resolves.toMatchObject({ mode: "clipboard" });

  expect(writeText).toHaveBeenCalledWith(manifest);
  const opened = new URL(String(open.mock.calls[0]?.[0]));
  expect(opened.searchParams.get("title")).toBe("[Kit submission]: Story Kit");
  expect(opened.searchParams.get("kit-title")).toBe("Story Kit");
  expect(opened.searchParams.get("kit-description")).toBe(
    "A complete roleplay stack.",
  );
  expect(opened.searchParams.get("manifest")).toBe(
    "Paste the Kit manifest copied by Tavernary here.",
  );
});

test("offers selectable text when clipboard access fails", async () => {
  vi.spyOn(window, "open").mockReturnValue(window);
  const prompt = vi.spyOn(window, "prompt").mockImplementation(() => null);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
  });
  const oversizedDraft = {
    ...draft,
    projectIds: ["x".repeat(7_100)],
  };
  const manifest = serializeKitManifest(oversizedDraft);

  await expect(
    openKitSubmission(
      "https://github.com/example/repo/issues/new",
      oversizedDraft,
    ),
  ).resolves.toMatchObject({ mode: "clipboard" });
  expect(prompt).toHaveBeenCalledWith(
    "Copy this Kit manifest, then paste it into the GitHub review:",
    manifest,
  );
});

test("reports a blocked Kit review without losing its prepared URL", async () => {
  vi.spyOn(window, "open").mockReturnValue(null);

  await expect(
    openKitSubmission("https://github.com/example/repo/issues/new", draft),
  ).rejects.toMatchObject({
    message: "GitHub review could not be opened.",
    url: expect.stringContaining("manifest="),
  });
});

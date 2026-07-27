import { beforeEach, expect, test, vi } from "vitest";

import { openProjectSubmission } from "@/features/submissions/submission-transport";

const manifest = {
  schema_version: 1 as const,
  project_type: "extension" as const,
  source_url: "https://github.com/example/project",
  name: "Example Project",
  description: "Adds useful roleplay tools.",
  frontends: {
    known_ids: ["sillytavern", "lumiverse"],
    other: [
      {
        name: "New Frontend",
        url: "https://github.com/example/frontend",
      },
    ],
  },
  frontend_independent: false,
  additional_context: "Thank you for reviewing it.",
};

const presetManifest = {
  ...manifest,
  schema_version: 2 as const,
  project_type: "preset" as const,
  frontends: {
    known_ids: ["sillytavern", "lumiverse"],
    other: [],
  },
  preset_compatibility: {
    model_families: {
      known_ids: ["model-agnostic", "claude"],
      other: ["FutureModel"],
    },
    completion_formats: ["chat-completion", "text-completion"],
  },
};

beforeEach(() => {
  vi.restoreAllMocks();
});

test("prefills every readable project field and the stable manifest", async () => {
  const open = vi.spyOn(window, "open").mockImplementation(() => null);

  await expect(
    openProjectSubmission(
      "https://github.com/example/repo/issues/new",
      manifest,
    ),
  ).resolves.toBe("prefilled");

  const opened = new URL(String(open.mock.calls[0]?.[0]));
  expect(Object.fromEntries(opened.searchParams)).toMatchObject({
    template: "01-project-submission.yml",
    "project-type": "Extension",
    "project-url": "https://github.com/example/project",
    "project-name": "Example Project",
    "project-description": "Adds useful roleplay tools.",
    "supported-frontends":
      "sillytavern\nlumiverse\nNew Frontend — https://github.com/example/frontend",
    "frontend-independent": "No",
    "additional-context": "Thank you for reviewing it.",
  });
  expect(JSON.parse(opened.searchParams.get("project-manifest") ?? "")).toEqual(
    manifest,
  );
  expect(open.mock.calls[0]?.slice(1)).toEqual([
    "_blank",
    "noopener,noreferrer",
  ]);
});

test("prefills every Preset compatibility field", async () => {
  const open = vi.spyOn(window, "open").mockImplementation(() => null);

  await openProjectSubmission(
    "https://github.com/example/repo/issues/new",
    presetManifest,
  );

  const opened = new URL(String(open.mock.calls[0]?.[0]));
  expect(Object.fromEntries(opened.searchParams)).toMatchObject({
    "project-type": "System Preset",
    "frontend-independent": "No",
    "supported-model-families": "model-agnostic\nclaude",
    "other-model-family": "FutureModel",
    "completion-formats": "chat-completion\ntext-completion",
  });
});

test("omits Preset-only fields for Extensions", async () => {
  const open = vi.spyOn(window, "open").mockImplementation(() => null);

  await openProjectSubmission(
    "https://github.com/example/repo/issues/new",
    manifest,
  );

  const opened = new URL(String(open.mock.calls[0]?.[0]));
  expect(opened.searchParams.has("supported-model-families")).toBe(false);
  expect(opened.searchParams.has("other-model-family")).toBe(false);
  expect(opened.searchParams.has("completion-formats")).toBe(false);
});

test("copies an oversized manifest while preserving readable prefills", async () => {
  const open = vi.spyOn(window, "open").mockImplementation(() => null);
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  const oversizedManifest = {
    ...manifest,
    additional_context: "x".repeat(7_100),
  };

  await expect(
    openProjectSubmission(
      "https://github.com/example/repo/issues/new",
      oversizedManifest,
    ),
  ).resolves.toBe("clipboard");

  expect(writeText).toHaveBeenCalledWith(
    expect.stringContaining('"schema_version": 1'),
  );
  const opened = new URL(String(open.mock.calls[0]?.[0]));
  expect(opened.toString().length).toBeLessThanOrEqual(7_000);
  expect(opened.searchParams.get("project-url")).toBe(manifest.source_url);
  expect(opened.searchParams.get("project-manifest")).toBe(
    "Paste the project manifest copied by Tavernary here.",
  );
});

test("offers selectable manifest text when clipboard access fails", async () => {
  vi.spyOn(window, "open").mockImplementation(() => null);
  const prompt = vi.spyOn(window, "prompt").mockImplementation(() => null);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
  });
  const oversizedManifest = {
    ...manifest,
    additional_context: "x".repeat(7_100),
  };

  await expect(
    openProjectSubmission(
      "https://github.com/example/repo/issues/new",
      oversizedManifest,
    ),
  ).resolves.toBe("clipboard");

  expect(prompt).toHaveBeenCalledWith(
    "Copy this project manifest, then paste it into the GitHub form:",
    expect.stringContaining('"project_type": "extension"'),
  );
});

test("keeps short identity and compatibility fields in oversized handoffs", async () => {
  const open = vi.spyOn(window, "open").mockImplementation(() => null);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });

  await openProjectSubmission("https://github.com/example/repo/issues/new", {
    ...presetManifest,
    description: "x".repeat(7_100),
    additional_context: "y".repeat(7_100),
  });

  const opened = new URL(String(open.mock.calls[0]?.[0]));
  expect(opened.searchParams.get("project-type")).toBe("System Preset");
  expect(opened.searchParams.get("supported-model-families")).toBe(
    "model-agnostic\nclaude",
  );
  expect(opened.searchParams.get("completion-formats")).toBe(
    "chat-completion\ntext-completion",
  );
});

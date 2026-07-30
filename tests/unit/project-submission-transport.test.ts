import { beforeEach, expect, test, vi } from "vitest";

import { openProjectSubmission } from "@/features/submissions/submission-transport";

const manifest = {
  schema_version: 4 as const,
  project_type: "extension" as const,
  primary_function: "interface-workflow",
  source_url: "https://github.com/example/project",
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
  metadata: {
    summary: {
      mode: "manual" as const,
      value: "Adds useful roleplay tools.",
    },
    tags: {
      mode: "manual" as const,
      values: ["customize-interface", "improve-accessibility"],
    },
  },
};

const presetManifest = {
  ...manifest,
  project_type: "preset" as const,
  primary_function: "preset",
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
  const open = vi.spyOn(window, "open").mockReturnValue(window);

  await expect(
    openProjectSubmission(
      "https://github.com/example/repo/issues/new",
      manifest,
    ),
  ).resolves.toMatchObject({ mode: "prefilled" });

  const opened = new URL(String(open.mock.calls[0]?.[0]));
  expect(Object.fromEntries(opened.searchParams)).toMatchObject({
    template: "01-project-submission.yml",
    "project-type": "Extension",
    "primary-function": "interface-workflow",
    "project-url": "https://github.com/example/project",
    "description-choice": "Write the description myself",
    "project-description": "Adds useful roleplay tools.",
    "tag-choice": "Set tags myself",
    tags: "customize-interface\nimprove-accessibility",
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
  const open = vi.spyOn(window, "open").mockReturnValue(window);

  await openProjectSubmission(
    "https://github.com/example/repo/issues/new",
    presetManifest,
  );

  const opened = new URL(String(open.mock.calls[0]?.[0]));
  expect(Object.fromEntries(opened.searchParams)).toMatchObject({
    "project-type": "System Preset",
    "primary-function": "preset",
    "frontend-independent": "No",
    "supported-model-families": "model-agnostic\nclaude",
    "other-model-family": "FutureModel",
    "completion-formats": "chat-completion\ntext-completion",
  });
});

test("omits Preset-only fields for Extensions", async () => {
  const open = vi.spyOn(window, "open").mockReturnValue(window);

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
  const open = vi.spyOn(window, "open").mockReturnValue(window);
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
  ).resolves.toMatchObject({ mode: "clipboard" });

  expect(writeText).toHaveBeenCalledWith(
    expect.stringContaining('"schema_version": 4'),
  );
  const opened = new URL(String(open.mock.calls[0]?.[0]));
  expect(opened.toString().length).toBeLessThanOrEqual(7_000);
  expect(opened.searchParams.get("project-url")).toBe(manifest.source_url);
  expect(opened.searchParams.get("project-manifest")).toBe(
    "Paste the project manifest copied by Tavernary here.",
  );
});

test("offers selectable manifest text when clipboard access fails", async () => {
  vi.spyOn(window, "open").mockReturnValue(window);
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
  ).resolves.toMatchObject({ mode: "clipboard" });

  expect(prompt).toHaveBeenCalledWith(
    "Copy this project manifest, then paste it into the GitHub review:",
    expect.stringContaining('"project_type": "extension"'),
  );
});

test("keeps short identity and compatibility fields in oversized handoffs", async () => {
  const open = vi.spyOn(window, "open").mockReturnValue(window);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });

  await openProjectSubmission("https://github.com/example/repo/issues/new", {
    ...presetManifest,
    additional_context: "y".repeat(7_100),
    metadata: {
      ...presetManifest.metadata,
      summary: { mode: "manual", value: "x".repeat(7_100) },
    },
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

test("reports a blocked project review without losing its prepared URL", async () => {
  vi.spyOn(window, "open").mockReturnValue(null);

  await expect(
    openProjectSubmission(
      "https://github.com/example/repo/issues/new",
      manifest,
    ),
  ).rejects.toMatchObject({
    message: "GitHub review could not be opened.",
    url: expect.stringContaining("project-manifest="),
  });
});

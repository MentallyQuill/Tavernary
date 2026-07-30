import { beforeEach, expect, test, vi } from "vitest";

import {
  openHelpRequest,
  type HelpHandoffInput,
} from "@/features/help/help-transport";

const websiteManifest = {
  schema_version: 1,
  request_kind: "website-bug",
  origin: { page_url: "/help/report-website/", site_revision: "abc123" },
  payload: {
    category: "accessibility",
    page_url: "https://tavernary.org/",
    actual_behavior: "The menu cannot be reached by keyboard.",
    expected_behavior: "The menu can be reached by keyboard.",
    reproduction_steps: "Press Tab from the page heading.",
    browser: null,
    device: null,
    additional_context: null,
  },
};

const baseInput = {
  formUrl: "https://github.com/example/repo/issues/new",
  template: "03-website-bug.yml",
  manifest: websiteManifest,
  manifestFieldId: "help-manifest" as const,
  prefills: [
    ["category", "Accessibility problem"],
    ["page-url", "https://tavernary.org/"],
  ],
  pasteInstruction: "Paste the Help manifest copied by Tavernary here.",
} satisfies HelpHandoffInput;

beforeEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

test("opens a readable GitHub form with the authoritative manifest", async () => {
  const open = vi.spyOn(window, "open").mockReturnValue(window);

  await expect(openHelpRequest(baseInput)).resolves.toMatchObject({
    mode: "prefilled",
  });

  const opened = new URL(open.mock.calls[0]?.[0] as string);
  expect(opened.searchParams.get("template")).toBe("03-website-bug.yml");
  expect(
    JSON.parse(opened.searchParams.get("help-manifest") ?? ""),
  ).toMatchObject({
    request_kind: "website-bug",
  });
  expect(Array.from(opened.searchParams.keys())).toEqual([
    "template",
    "category",
    "page-url",
    "help-manifest",
  ]);
  expect(open.mock.calls[0]?.slice(1)).toEqual([
    "_blank",
    "noopener,noreferrer",
  ]);
});

test("copies the complete manifest and retains higher-priority fallback prefills", async () => {
  const open = vi.spyOn(window, "open").mockReturnValue(window);
  const writeText = vi.mocked(navigator.clipboard.writeText);
  const oversizedManifest = {
    ...websiteManifest,
    payload: {
      ...websiteManifest.payload,
      additional_context: "x".repeat(7_100),
    },
  };

  await expect(
    openHelpRequest({
      ...baseInput,
      manifest: oversizedManifest,
      prefills: [
        ["category", "Accessibility problem"],
        ["large", "x".repeat(7_100)],
        ["page-url", "https://tavernary.org/"],
      ],
    }),
  ).resolves.toMatchObject({ mode: "clipboard" });

  expect(writeText).toHaveBeenCalledWith(
    `${JSON.stringify(oversizedManifest, null, 2)}\n`,
  );
  const opened = new URL(open.mock.calls[0]?.[0] as string);
  expect(opened.toString().length).toBeLessThanOrEqual(7_000);
  expect(opened.searchParams.get("help-manifest")).toBe(
    "Paste the Help manifest copied by Tavernary here.",
  );
  expect(opened.searchParams.get("category")).toBe("Accessibility problem");
  expect(opened.searchParams.get("large")).toBeNull();
  expect(opened.searchParams.get("page-url")).toBe("https://tavernary.org/");
});

test("offers the manifest as selectable text when clipboard access fails", async () => {
  vi.spyOn(window, "open").mockReturnValue(window);
  const prompt = vi.spyOn(window, "prompt").mockReturnValue(null);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
  });

  await expect(
    openHelpRequest({
      ...baseInput,
      manifest: {
        ...websiteManifest,
        payload: {
          ...websiteManifest.payload,
          additional_context: "x".repeat(7_100),
        },
      },
    }),
  ).resolves.toMatchObject({ mode: "clipboard" });

  expect(prompt).toHaveBeenCalledWith(
    "Paste the Help manifest copied by Tavernary here.",
    expect.stringContaining('"request_kind": "website-bug"'),
  );
});

test("throws before opening an impossible fallback URL", async () => {
  const open = vi.spyOn(window, "open").mockReturnValue(window);

  await expect(
    openHelpRequest({
      ...baseInput,
      formUrl: `https://github.com/${"x".repeat(7_100)}`,
      manifest: {
        ...websiteManifest,
        payload: {
          ...websiteManifest.payload,
          additional_context: "x".repeat(7_100),
        },
      },
    }),
  ).rejects.toThrow("GitHub review URL exceeds the safe handoff limit.");

  expect(open).not.toHaveBeenCalled();
});

test("throws a recoverable handoff error when GitHub cannot be opened", async () => {
  vi.spyOn(window, "open").mockReturnValue(null);

  await expect(openHelpRequest(baseInput)).rejects.toMatchObject({
    message: "GitHub review could not be opened.",
    url: expect.stringContaining("help-manifest="),
  });
});

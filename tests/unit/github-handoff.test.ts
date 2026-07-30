import { beforeEach, expect, test, vi } from "vitest";

import {
  GitHubHandoffError,
  openGitHubReview,
  type GitHubHandoffInput,
} from "@/features/submissions/github-handoff";

function input(
  overrides: Partial<GitHubHandoffInput> = {},
): GitHubHandoffInput {
  return {
    formUrl: "https://github.com/example/repo/issues/new",
    template: "example.yml",
    manifestFieldId: "manifest",
    serializedManifest: '{"schema_version":1}',
    prefills: [["summary", "Readable summary"]],
    pasteInstruction: "Paste the manifest copied by Tavernary here.",
    copyPrompt: "Copy this manifest into the GitHub review:",
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

test("opens a short generated review and returns its exact URL", async () => {
  const open = vi.spyOn(window, "open").mockReturnValue(window);

  const result = await openGitHubReview(input());

  expect(result).toEqual({
    mode: "prefilled",
    url: open.mock.calls[0]?.[0],
  });
  const opened = new URL(result.url);
  expect(Object.fromEntries(opened.searchParams)).toEqual({
    template: "example.yml",
    summary: "Readable summary",
    manifest: '{"schema_version":1}',
  });
  expect(open.mock.calls[0]?.slice(1)).toEqual([
    "_blank",
    "noopener,noreferrer",
  ]);
});

test("reports a blocked popup as recovery instead of success", async () => {
  vi.spyOn(window, "open").mockReturnValue(null);

  await expect(openGitHubReview(input())).rejects.toEqual(
    expect.objectContaining({
      name: "GitHubHandoffError",
      message: "GitHub review could not be opened.",
      url: expect.stringContaining("manifest="),
    }),
  );
});

test("keeps a generated review at the 7000-character boundary prefilled", async () => {
  vi.spyOn(window, "open").mockReturnValue(window);
  const empty = new URL("https://github.com/example/repo/issues/new");
  empty.searchParams.set("template", "example.yml");
  empty.searchParams.set("manifest", "");
  const serializedManifest = "a".repeat(7_000 - empty.toString().length);

  const result = await openGitHubReview(
    input({ serializedManifest, prefills: [] }),
  );

  expect(result.mode).toBe("prefilled");
  expect(result.url).toHaveLength(7_000);
});

test("copies an oversized manifest unchanged and trims only overflowing readable prefills", async () => {
  const open = vi.spyOn(window, "open").mockReturnValue(window);
  const writeText = vi.mocked(navigator.clipboard.writeText);
  const serializedManifest = JSON.stringify({
    schema_version: 1,
    content: "x".repeat(7_100),
  });

  const result = await openGitHubReview(
    input({
      serializedManifest,
      prefills: [
        ["priority", "Keep first"],
        ["oversized-readable", "y".repeat(7_100)],
        ["route", "/help/other/"],
      ],
    }),
  );

  expect(result.mode).toBe("clipboard");
  expect(writeText).toHaveBeenCalledWith(serializedManifest);
  expect(result.url.length).toBeLessThanOrEqual(7_000);
  const opened = new URL(String(open.mock.calls[0]?.[0]));
  expect(opened.searchParams.get("manifest")).toBe(
    "Paste the manifest copied by Tavernary here.",
  );
  expect(opened.searchParams.get("priority")).toBe("Keep first");
  expect(opened.searchParams.get("oversized-readable")).toBeNull();
  expect(opened.searchParams.get("route")).toBe("/help/other/");
});

test("shows the unchanged manifest in a prompt when clipboard access fails", async () => {
  vi.spyOn(window, "open").mockReturnValue(window);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
  });
  const prompt = vi.spyOn(window, "prompt").mockReturnValue(null);
  const serializedManifest = JSON.stringify({
    schema_version: 1,
    content: "x".repeat(7_100),
  });

  await openGitHubReview(input({ serializedManifest }));

  expect(prompt).toHaveBeenCalledWith(
    "Copy this manifest into the GitHub review:",
    serializedManifest,
  );
});

test("fails without opening when even the recovery URL exceeds the safe limit", async () => {
  const open = vi.spyOn(window, "open").mockReturnValue(window);

  await expect(
    openGitHubReview(
      input({
        formUrl: `https://github.com/${"x".repeat(7_100)}`,
        serializedManifest: "y".repeat(7_100),
        prefills: [],
      }),
    ),
  ).rejects.toEqual(
    new GitHubHandoffError(
      "GitHub review URL exceeds the safe handoff limit.",
      null,
    ),
  );
  expect(open).not.toHaveBeenCalled();
});

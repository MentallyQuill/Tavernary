import { describe, expect, test } from "vitest";

import {
  countWords,
  kitSetKey,
  validateKitDraft,
} from "@/features/kits/kit-domain.mjs";

const projects = [
  { id: "frontend", kind: "frontend", visibility: "published" },
  { id: "frontend-b", kind: "frontend", visibility: "published" },
  { id: "memory", kind: "extension", visibility: "published" },
  { id: "preset", kind: "preset", visibility: "published" },
  { id: "flagged", kind: "extension", visibility: "quarantined" },
];

describe("Kit domain", () => {
  test("counts whitespace-separated words", () => {
    expect(countWords(" one\n two   three ")).toBe(3);
    expect(countWords(" \n ")).toBe(0);
  });

  test("treats reordered project sets as exact duplicates", () => {
    expect(kitSetKey(["preset", "frontend", "memory"])).toBe(
      kitSetKey(["memory", "preset", "frontend"]),
    );
  });

  test("accepts a valid plain-text composition", () => {
    expect(
      validateKitDraft(
        {
          operation: "create",
          kitId: null,
          title: "Story Kit",
          description: "A compact story stack.",
          projectIds: ["frontend", "memory", "preset"],
        },
        projects,
      ),
    ).toEqual({ valid: true, errors: [] });
  });

  test("rejects a composition with more than one Frontend", () => {
    const result = validateKitDraft(
      {
        operation: "create",
        kitId: null,
        title: "Story Kit",
        description: "A compact story stack.",
        projectIds: ["frontend", "frontend-b", "memory"],
      },
      projects,
    );

    expect(result.errors).toContain("A Kit requires exactly one Frontend.");
  });

  test("rejects a Frontend outside the first project position", () => {
    const result = validateKitDraft(
      {
        operation: "create",
        kitId: null,
        title: "Story Kit",
        description: "A compact story stack.",
        projectIds: ["memory", "frontend", "preset"],
      },
      projects,
    );

    expect(result.errors).toContain(
      "The Kit Frontend must be the first project.",
    );
  });

  test("requires at least two non-Frontend projects", () => {
    const result = validateKitDraft(
      {
        operation: "create",
        kitId: null,
        title: "Story Kit",
        description: "A compact story stack.",
        projectIds: ["frontend", "memory"],
      },
      projects,
    );

    expect(result.errors).toContain(
      "A Kit requires at least two non-Frontend projects.",
    );
  });

  test("rejects invalid composition, duplicates, unknown and flagged projects", () => {
    const result = validateKitDraft(
      {
        operation: "create",
        kitId: null,
        title: "No",
        description: "Read https://example.com for [details](elsewhere).",
        projectIds: ["frontend", "frontend", "missing", "flagged"],
      },
      projects,
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "Title must contain 3–60 characters.",
        "Kit text cannot contain links or markup.",
        "A Kit cannot contain duplicate projects.",
        "Every Kit project must exist in the catalog.",
        "A Kit cannot contain flagged projects.",
        "A Kit requires exactly one Frontend.",
        "A Kit requires at least two non-Frontend projects.",
      ]),
    );
  });

  test("enforces the 100-word description and 50-project ceiling", () => {
    const manyProjects = [
      ...projects,
      ...Array.from({ length: 48 }, (_, index) => ({
        id: `extension-${index}`,
        kind: "extension",
        visibility: "published",
      })),
    ];
    const result = validateKitDraft(
      {
        operation: "create",
        kitId: null,
        title: "Oversized Kit",
        description: Array.from({ length: 101 }, () => "word").join(" "),
        projectIds: manyProjects.map(({ id }) => id),
      },
      manyProjects,
    );

    expect(result.errors).toContain("Description must contain 1–100 words.");
    expect(result.errors).toContain("A Kit must contain 3–50 projects.");
  });
});

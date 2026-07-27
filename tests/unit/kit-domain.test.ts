import { describe, expect, test } from "vitest";

import { kitSetKey, validateKitDraft } from "@/features/kits/kit-domain.mjs";

const projects = [
  { id: "frontend", kind: "frontend", visibility: "published" },
  { id: "frontend-b", kind: "frontend", visibility: "published" },
  { id: "memory", kind: "extension", visibility: "published" },
  { id: "preset", kind: "preset", visibility: "published" },
  { id: "flagged", kind: "extension", visibility: "quarantined" },
];

describe("Kit domain", () => {
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

  test("accepts 600 description characters and rejects 601", () => {
    const baseDraft = {
      operation: "create" as const,
      kitId: null,
      title: "Character Boundary Kit",
      projectIds: ["frontend", "memory", "preset"],
    };

    expect(
      validateKitDraft({ ...baseDraft, description: "a".repeat(600) }, projects)
        .valid,
    ).toBe(true);

    const result = validateKitDraft(
      { ...baseDraft, description: "a".repeat(601) },
      projects,
    );

    expect(result.errors).toContain(
      "Description must contain 1–600 characters.",
    );
  });

  test("rejects severe language in title and description", () => {
    const titleResult = validateKitDraft(
      {
        operation: "create",
        kitId: null,
        title: "N1gg3r Story Kit",
        description: "A compact story stack.",
        projectIds: ["frontend", "memory", "preset"],
      },
      projects,
    );
    const descriptionResult = validateKitDraft(
      {
        operation: "create",
        kitId: null,
        title: "Story Kit",
        description: "A f.a.g.g.o.t story stack.",
        projectIds: ["frontend", "memory", "preset"],
      },
      projects,
    );

    expect(titleResult.errors).toContain(
      "Title contains language Tavernary doesn't allow.",
    );
    expect(descriptionResult.errors).toContain(
      "Description contains language Tavernary doesn't allow.",
    );
  });

  test.each(["Damn Good Kit", "Badass Kit", "This shit works."])(
    "allows common profanity in Kit text: %s",
    (text) => {
      expect(
        validateKitDraft(
          {
            operation: "create",
            kitId: null,
            title: text,
            description: text,
            projectIds: ["frontend", "memory", "preset"],
          },
          projects,
        ).errors,
      ).not.toEqual(
        expect.arrayContaining([
          expect.stringContaining("language Tavernary doesn't allow"),
        ]),
      );
    },
  );

  test("enforces the 50-project ceiling", () => {
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
        description: "A compact story stack.",
        projectIds: manyProjects.map(({ id }) => id),
      },
      manyProjects,
    );

    expect(result.errors).toContain("A Kit must contain 3–50 projects.");
  });
});

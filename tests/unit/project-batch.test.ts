import { expect, test } from "vitest";

import { planKitProjectBatch } from "@/features/kits/project-batch";

const projects = [
  { id: "frontend-a", kind: "frontend" as const },
  { id: "frontend-b", kind: "frontend" as const },
  { id: "memory", kind: "extension" as const },
  { id: "preset", kind: "preset" as const },
];

test("replaces the Frontend while retaining ordered non-Frontend projects", () => {
  expect(
    planKitProjectBatch({
      draftProjectIds: ["frontend-a", "memory"],
      selectedProjectIds: ["frontend-b", "preset", "memory"],
      projects,
    }),
  ).toEqual({
    projectIds: ["frontend-b", "memory", "preset"],
    addedProjectIds: ["frontend-b", "preset"],
    skippedProjectIds: ["memory"],
    replacedFrontendId: "frontend-a",
    limitReached: false,
  });
});

test("skips unknown and duplicate selected project IDs", () => {
  expect(
    planKitProjectBatch({
      draftProjectIds: [],
      selectedProjectIds: ["unknown", "memory", "memory"],
      projects,
    }),
  ).toEqual({
    projectIds: ["memory"],
    addedProjectIds: ["memory"],
    skippedProjectIds: ["unknown", "memory"],
    replacedFrontendId: null,
    limitReached: false,
  });
});

test("accepts projects in order until the Kit limit is reached", () => {
  const existing = Array.from(
    { length: 47 },
    (_, index) => `existing-${index}`,
  );
  const selected = ["new-a", "new-b", "new-c", "new-d"];
  const capacityProjects = [...existing, ...selected].map((id) => ({
    id,
    kind: "extension" as const,
  }));

  const plan = planKitProjectBatch({
    draftProjectIds: existing,
    selectedProjectIds: selected,
    projects: capacityProjects,
  });

  expect(plan.projectIds).toHaveLength(50);
  expect(plan.projectIds.slice(-3)).toEqual(["new-a", "new-b", "new-c"]);
  expect(plan.addedProjectIds).toEqual(["new-a", "new-b", "new-c"]);
  expect(plan.skippedProjectIds).toEqual(["new-d"]);
  expect(plan.limitReached).toBe(true);
});

test("keeps only the last selected Frontend", () => {
  expect(
    planKitProjectBatch({
      draftProjectIds: ["memory"],
      selectedProjectIds: ["frontend-a", "frontend-b"],
      projects,
    }),
  ).toEqual({
    projectIds: ["frontend-b", "memory"],
    addedProjectIds: ["frontend-b"],
    skippedProjectIds: ["frontend-a"],
    replacedFrontendId: null,
    limitReached: false,
  });
});

test("allows Frontend replacement when a Kit is already at capacity", () => {
  const stack = Array.from({ length: 49 }, (_, index) => `stack-${index}`);
  const capacityProjects = [
    { id: "frontend-a", kind: "frontend" as const },
    { id: "frontend-b", kind: "frontend" as const },
    ...stack.map((id) => ({ id, kind: "extension" as const })),
  ];

  const plan = planKitProjectBatch({
    draftProjectIds: ["frontend-a", ...stack],
    selectedProjectIds: ["frontend-b"],
    projects: capacityProjects,
  });

  expect(plan.projectIds).toHaveLength(50);
  expect(plan.projectIds[0]).toBe("frontend-b");
  expect(plan.addedProjectIds).toEqual(["frontend-b"]);
  expect(plan.replacedFrontendId).toBe("frontend-a");
  expect(plan.limitReached).toBe(false);
});

import { expect, test } from "vitest";

import {
  normalizeKitProjectIds,
  replaceKitFrontend,
  splitKitProjectIds,
} from "@/features/kits/kit-project-layout";

const projects = [
  { id: "frontend-a", kind: "frontend" as const },
  { id: "frontend-b", kind: "frontend" as const },
  { id: "memory", kind: "extension" as const },
  { id: "preset", kind: "preset" as const },
];

test("splits the Frontend from the ordered project stack", () => {
  expect(
    splitKitProjectIds(["memory", "frontend-a", "preset"], projects),
  ).toEqual({
    frontendId: "frontend-a",
    stackProjectIds: ["memory", "preset"],
  });
});

test("normalizes the Frontend to the first project position", () => {
  expect(
    normalizeKitProjectIds(["memory", "frontend-a", "preset"], projects),
  ).toEqual(["frontend-a", "memory", "preset"]);
});

test("replaces every existing Frontend without disturbing stack order", () => {
  expect(
    replaceKitFrontend(
      ["frontend-a", "memory", "frontend-b", "preset"],
      "frontend-b",
      projects,
    ),
  ).toEqual(["frontend-b", "memory", "preset"]);
});

test("rejects replacement with a non-Frontend project", () => {
  expect(() =>
    replaceKitFrontend(["frontend-a", "preset"], "memory", projects),
  ).toThrowError("memory is not a Frontend project.");
});

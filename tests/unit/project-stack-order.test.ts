import { expect, test } from "vitest";

import {
  addProject,
  moveProject,
  removeProject,
  reorderProject,
} from "@/features/kits/project-stack-order";

test("adds only new projects", () => {
  const original = ["a", "b"];
  expect(addProject(original, "c")).toEqual(["a", "b", "c"]);
  expect(addProject(original, "b")).toBe(original);
});

test("moves projects with clamped destinations", () => {
  expect(moveProject(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
  expect(moveProject(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
  expect(moveProject(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
});

test("reorders after a target and removes by ID", () => {
  expect(reorderProject(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
  expect(removeProject(["a", "b"], "a")).toEqual(["b"]);
});

test("returns the original array for missing and no-op operations", () => {
  const original = ["a", "b"];
  expect(removeProject(original, "missing")).toBe(original);
  expect(reorderProject(original, "a", "a")).toBe(original);
  expect(reorderProject(original, "missing", "b")).toBe(original);
});

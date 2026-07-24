import { expect, test } from "vitest";

import { validateSubmission } from "../../scripts/submissions/validate-submission.mjs";

test("rejects an extension without GitHub", () => {
  expect(
    validateSubmission({
      kind: "Extension",
      sourceUrl: "https://example.com/tool",
      existingSources: [],
    }),
  ).toEqual({
    labels: ["needs-information"],
    errors: ["Frontends and Extensions require a public GitHub repository."],
  });
});

test("accepts a non-GitHub System Preset for curator review", () => {
  expect(
    validateSubmission({
      kind: "System Preset",
      sourceUrl: "https://example.com/preset",
      existingSources: [],
    }),
  ).toEqual({ labels: ["needs-curator-review"], errors: [] });
});

test("flags an existing canonical source", () => {
  expect(
    validateSubmission({
      kind: "Extension",
      sourceUrl: "https://github.com/MentallyQuill/Recursion.git/",
      existingSources: ["https://github.com/mentallyquill/recursion"],
    }).labels,
  ).toContain("duplicate-candidate");
});

test("rejects invalid and non-HTTPS source URLs", () => {
  expect(
    validateSubmission({
      kind: "System Preset",
      sourceUrl: "not a URL",
      existingSources: [],
    }),
  ).toEqual({
    labels: ["needs-information"],
    errors: ["Canonical source URL must be a valid HTTPS URL."],
  });
  expect(
    validateSubmission({
      kind: "System Preset",
      sourceUrl: "http://example.com/preset",
      existingSources: [],
    }).errors,
  ).toContain("Canonical source URL must be a valid HTTPS URL.");
});

test("requires an exact GitHub owner and repository path", () => {
  expect(
    validateSubmission({
      kind: "Frontend",
      sourceUrl: "https://github.com/owner/repository/issues",
      existingSources: [],
    }).errors,
  ).toContain("Frontends and Extensions require a public GitHub repository.");
});

test("ignores malformed existing source values during duplicate checks", () => {
  expect(
    validateSubmission({
      kind: "System Preset",
      sourceUrl: "https://example.com/preset",
      existingSources: ["not a URL"],
    }),
  ).toEqual({ labels: ["needs-curator-review"], errors: [] });
});

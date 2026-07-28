import { expect, test } from "vitest";

import { validateSubmission } from "../../scripts/submissions/validate-submission.mjs";

test("rejects an extension without a supported repository provider", () => {
  expect(
    validateSubmission({
      kind: "Extension",
      sourceUrl: "https://example.com/tool",
      existingSources: [],
    }),
  ).toEqual({
    labels: ["needs-information"],
    errors: ["Extensions require a public GitHub or Codeberg repository."],
  });
});

test("accepts a non-GitHub System Preset for maintainer review", () => {
  expect(
    validateSubmission({
      kind: "System Preset",
      sourceUrl: "https://example.com/preset",
      existingSources: [],
    }),
  ).toEqual({ labels: ["needs-maintainer-review"], errors: [] });
});

test("accepts a non-GitHub Frontend for maintainer review", () => {
  expect(
    validateSubmission({
      kind: "Frontend",
      sourceUrl: "https://codeberg.org/example/frontend",
      existingSources: [],
    }),
  ).toEqual({ labels: ["needs-maintainer-review"], errors: [] });
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

test("requires an exact supported owner and repository path for Extensions", () => {
  expect(
    validateSubmission({
      kind: "Extension",
      sourceUrl: "https://github.com/owner/repository/issues",
      existingSources: [],
    }).errors,
  ).toContain("Extensions require a public GitHub or Codeberg repository.");
});

test("accepts an exact Codeberg repository for Extensions", () => {
  expect(
    validateSubmission({
      kind: "Extension",
      sourceUrl: "https://codeberg.org/targren/Lumiverse-SwipeScrubber.git",
      existingSources: [],
    }),
  ).toEqual({ labels: ["needs-maintainer-review"], errors: [] });
});

test("ignores malformed existing source values during duplicate checks", () => {
  expect(
    validateSubmission({
      kind: "System Preset",
      sourceUrl: "https://example.com/preset",
      existingSources: ["not a URL"],
    }),
  ).toEqual({ labels: ["needs-maintainer-review"], errors: [] });
});

test("detects duplicates by permanent GitHub repository ID", () => {
  expect(
    validateSubmission({
      projectType: "extension",
      identity: {
        kind: "repository",
        provider: "github",
        canonicalUrl: "https://github.com/NewOwner/NewName",
        repository: "NewOwner/NewName",
        repositoryId: 123,
        owner: "NewOwner",
        name: "NewName",
      },
      existingIdentities: [
        {
          kind: "repository",
          provider: "github",
          canonicalUrl: "https://github.com/OldOwner/OldName",
          repository: "OldOwner/OldName",
          repositoryId: 123,
          owner: "OldOwner",
          name: "OldName",
        },
      ],
    }),
  ).toEqual({ duplicate: true, errors: [] });
});

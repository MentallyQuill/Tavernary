import { expect, test } from "vitest";

import { validateKitSubmission } from "../../scripts/submissions/validate-kit-submission.mjs";

const projects = [
  { id: "frontend", kind: "frontend", visibility: "published" },
  { id: "memory", kind: "extension", visibility: "published" },
  { id: "lore", kind: "extension", visibility: "published" },
  { id: "writer", kind: "extension", visibility: "published" },
  { id: "flagged", kind: "extension", visibility: "flagged" },
];
const existing = {
  id: "existing-1",
  status: "published",
  title: "Existing",
  author: { github_user_id: 42, login: "author" },
  project_ids: ["frontend", "memory", "lore"],
};
const create = JSON.stringify({
  operation: "create",
  kit_id: null,
  title: "New Story Kit",
  description: "A complete roleplay stack.",
  project_ids: ["frontend", "memory", "writer"],
});

function validate(
  manifest = create,
  actor = { id: 42, login: "author" },
  kits = [existing],
) {
  return validateKitSubmission({
    manifest,
    actor,
    projects,
    kits,
    blockedUsers: { schema_version: 1, blocked: [] },
  });
}

test("accepts valid create and matching-author edit manifests", () => {
  expect(validate()).toMatchObject({
    valid: true,
    labels: ["needs-maintainer-review"],
    errors: [],
  });
  expect(
    validate(
      JSON.stringify({
        operation: "edit",
        kit_id: "existing-1",
        title: "Revised Existing",
        description: "A revised complete stack.",
        project_ids: ["frontend", "memory", "writer"],
      }),
    ),
  ).toMatchObject({ valid: true, labels: ["needs-maintainer-review"] });
});

test("rejects malformed manifests and blocked actors", () => {
  expect(validate("{")).toMatchObject({
    valid: false,
    labels: ["needs-information"],
  });
  expect(
    validateKitSubmission({
      manifest: create,
      actor: { id: 99, login: "blocked" },
      projects,
      kits: [],
      blockedUsers: {
        schema_version: 1,
        blocked: [{ github_user_id: 99, login: "blocked", reason: "Abuse" }],
      },
    }),
  ).toMatchObject({
    valid: false,
    errors: expect.arrayContaining([
      "This GitHub identity is blocked from Kit submissions.",
    ]),
  });
});

test("blocks exact project sets and warns on near duplicates", () => {
  const duplicate = validate(
    JSON.stringify({
      ...JSON.parse(create),
      project_ids: ["lore", "frontend", "memory"],
    }),
  );
  expect(duplicate).toMatchObject({
    valid: false,
    labels: ["duplicate-candidate"],
  });

  const near = validate(
    JSON.stringify({
      ...JSON.parse(create),
      project_ids: ["frontend", "memory", "lore", "writer"],
    }),
  );
  expect(near).toMatchObject({
    valid: true,
    labels: ["needs-maintainer-review", "duplicate-candidate"],
    warnings: expect.arrayContaining([
      expect.stringContaining("near-duplicate"),
    ]),
  });
});

test("rejects flagged projects and edits by a different numeric actor", () => {
  expect(
    validate(
      JSON.stringify({
        ...JSON.parse(create),
        project_ids: ["frontend", "memory", "flagged"],
      }),
    ),
  ).toMatchObject({
    valid: false,
    errors: expect.arrayContaining(["A Kit cannot contain flagged projects."]),
  });
  expect(
    validate(
      JSON.stringify({
        operation: "edit",
        kit_id: "existing-1",
        title: "Revised Existing",
        description: "A revised complete stack.",
        project_ids: ["frontend", "memory", "writer"],
      }),
      { id: 7, login: "other" },
    ),
  ).toMatchObject({
    valid: false,
    errors: expect.arrayContaining(["Only the Kit author may submit an edit."]),
  });
});

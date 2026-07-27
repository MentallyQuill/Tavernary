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
    labels: ["kit-publication-ready"],
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
  ).toMatchObject({ valid: true, labels: ["kit-publication-ready"] });
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
    labels: ["kit-publication-ready", "duplicate-candidate"],
    warnings: expect.arrayContaining([
      "This composition is a near-duplicate of an existing Kit.",
    ]),
  });
});

test("allows an identical create retry from its already-published source issue", () => {
  const retry = validateKitSubmission({
    manifest: JSON.stringify({
      operation: "create",
      kit_id: null,
      title: "Existing",
      description: "A complete roleplay stack.",
      project_ids: existing.project_ids,
    }),
    actor: { id: 42, login: "author" },
    projects,
    kits: [{ ...existing, source_issue_number: 241 }],
    blockedUsers: { schema_version: 1, blocked: [] },
    sourceIssueNumber: 241,
  });

  expect(retry).toMatchObject({
    valid: true,
    labels: ["kit-publication-ready"],
    errors: [],
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

test("rejects edits to a withdrawn Kit", () => {
  const result = validate(
    JSON.stringify({
      operation: "edit",
      kit_id: "existing-1",
      title: "Revised Existing",
      description: "A revised complete stack.",
      project_ids: ["frontend", "memory", "writer"],
    }),
    { id: 42, login: "author" },
    [{ ...existing, status: "withdrawn" }],
  );

  expect(result).toMatchObject({
    valid: false,
    errors: expect.arrayContaining(["A withdrawn Kit cannot be edited."]),
  });
});

test("rechecks severe language from the GitHub manifest", () => {
  expect(
    validate(
      JSON.stringify({
        ...JSON.parse(create),
        title: "N1gg3r Story Kit",
      }),
    ),
  ).toMatchObject({
    valid: false,
    labels: ["needs-information"],
    errors: expect.arrayContaining([
      "Title contains language Tavernary doesn't allow.",
    ]),
  });
  expect(
    validate(
      JSON.stringify({
        ...JSON.parse(create),
        description: "A f.a.g.g.o.t story stack.",
      }),
    ),
  ).toMatchObject({
    valid: false,
    errors: expect.arrayContaining([
      "Description contains language Tavernary doesn't allow.",
    ]),
  });
});

test.each(["Damn Good Kit", "Badass Kit", "This shit works."])(
  "keeps common profanity valid on GitHub: %s",
  (text) => {
    expect(
      validate(
        JSON.stringify({
          ...JSON.parse(create),
          title: text,
          description: text,
        }),
      ).valid,
    ).toBe(true);
  },
);

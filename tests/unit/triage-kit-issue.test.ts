import { expect, test } from "vitest";

import { validateKitIssue } from "../../scripts/submissions/triage-kit-issue.mjs";

const projects = [
  { id: "frontend", kind: "frontend", visibility: "published" },
  { id: "memory", kind: "extension", visibility: "published" },
  { id: "writer", kind: "extension", visibility: "published" },
];
const kits = [
  {
    id: "another-authors-kit",
    status: "published",
    title: "Another author's Kit",
    author: { github_user_id: 42, login: "author" },
    source_issue_number: 100,
    project_ids: ["frontend", "memory", "writer"],
  },
];
const trustedEditors = {
  schema_version: 1 as const,
  editors: [
    {
      github_user_id: 2625904,
      login: "MentallyQuill",
      role: "owner" as const,
    },
  ],
};
const manifest = JSON.stringify({
  operation: "edit",
  kit_id: "another-authors-kit",
  title: "Staff-corrected title",
  description: "A corrected complete stack.",
  project_ids: ["frontend", "memory", "writer"],
});

function issue(actor: { id: number; login: string; association: string }) {
  return {
    number: 241,
    body: `### Kit manifest\n\n\`\`\`json\n${manifest}\n\`\`\``,
    user: { id: actor.id, login: actor.login },
    author_association: actor.association,
  };
}

test("threads the refreshed issue actor and association into staff validation", () => {
  expect(
    validateKitIssue({
      issue: issue({
        id: 2625904,
        login: "MentallyQuill",
        association: "OWNER",
      }),
      projects,
      kits,
      blockedUsers: { schema_version: 1, blocked: [] },
      trustedEditors,
    }),
  ).toMatchObject({
    valid: true,
    editAuthority: "tavernary-staff",
  });
});

test("does not treat repository association alone as Kit edit authority", () => {
  expect(
    validateKitIssue({
      issue: issue({
        id: 7,
        login: "unlisted-collaborator",
        association: "COLLABORATOR",
      }),
      projects,
      kits,
      blockedUsers: { schema_version: 1, blocked: [] },
      trustedEditors,
    }),
  ).toMatchObject({
    valid: false,
    editAuthority: null,
  });
});

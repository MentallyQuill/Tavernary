import { describe, expect, test } from "vitest";

import {
  validateTrustedEditorRegistry,
  verifyTrustedEditor,
} from "../../scripts/maintenance/trusted-editor-authority.mjs";

const registry = {
  schema_version: 1 as const,
  editors: [
    {
      github_user_id: 2_625_904,
      login: "MentallyQuill",
      role: "owner" as const,
    },
    {
      github_user_id: 42,
      login: "TavernaryMaintainer",
      role: "maintainer" as const,
    },
  ],
};

describe("trusted Tavernary editor registry", () => {
  test("authorizes an immutable ID only with a current trusted association", () => {
    expect(
      verifyTrustedEditor({
        actor: { id: 2_625_904, login: "MentallyQuill" },
        association: "OWNER",
        registry,
      }),
    ).toEqual({
      authorized: true,
      actorLogin: "MentallyQuill",
      role: "owner",
    });
    expect(
      verifyTrustedEditor({
        actor: { id: 42, login: "RenamedMaintainer" },
        association: "MEMBER",
        registry,
      }),
    ).toEqual({
      authorized: true,
      actorLogin: "RenamedMaintainer",
      role: "maintainer",
    });
  });

  test.each(["NONE", "CONTRIBUTOR", "FIRST_TIMER"])(
    "rejects a stale %s association",
    (association) => {
      expect(
        verifyTrustedEditor({
          actor: { id: 2_625_904, login: "MentallyQuill" },
          association,
          registry,
        }),
      ).toMatchObject({
        authorized: false,
        reasonCode: "association-not-trusted",
      });
    },
  );

  test("never authorizes from login or association without the immutable ID", () => {
    for (const actor of [
      { id: 99, login: "MentallyQuill" },
      { id: 99, login: "Other" },
      { id: 0, login: "MentallyQuill" },
    ]) {
      expect(
        verifyTrustedEditor({
          actor,
          association: "COLLABORATOR",
          registry,
        }),
      ).toMatchObject({ authorized: false });
    }
  });

  test.each([
    [
      "duplicate immutable IDs",
      {
        ...registry,
        editors: [
          registry.editors[0],
          { ...registry.editors[1], github_user_id: 2_625_904 },
        ],
      },
    ],
    [
      "duplicate case-insensitive logins",
      {
        ...registry,
        editors: [
          registry.editors[0],
          { ...registry.editors[1], login: "mentallyquill" },
        ],
      },
    ],
    [
      "non-positive IDs",
      {
        ...registry,
        editors: [{ ...registry.editors[0], github_user_id: 0 }],
      },
    ],
    [
      "unknown roles",
      {
        ...registry,
        editors: [{ ...registry.editors[0], role: "contributor" }],
      },
    ],
  ])("rejects %s", (_label, candidate) => {
    expect(validateTrustedEditorRegistry(candidate)).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([expect.any(String)]),
    });
  });
});

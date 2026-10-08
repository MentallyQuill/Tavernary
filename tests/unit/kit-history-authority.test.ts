import { expect, test } from "vitest";
import { discoverKitOperations } from "../../scripts/automation/kit-operations.mjs";
import { kitInventoryFixture } from "../helpers/automation-fixtures";

test("a changed create request cannot borrow publication proof from its earlier manifest", () => {
  const input = kitInventoryFixture({ canonicalPublished: true });
  input.issues[0].body = input.issues[0].body.replace(
    "Example Kit",
    "Changed Kit",
  );
  const operations = discoverKitOperations(input);
  expect(operations[0].stage).not.toBe("published");
  expect(operations[0].retry?.failure.kind).toBe("permanent");
});

test("an identical staff edit recognizes canonical data only while the editor remains trusted", () => {
  const input = kitInventoryFixture({ operation: "edit" });
  input.issues[0].user = { id: 2625904, login: "MentallyQuill", type: "User" };
  input.issues[0].author_association = "OWNER";
  const registry = {
    schema_version: 1 as const,
    editors: [
      {
        github_user_id: 2625904,
        login: "MentallyQuill",
        role: "owner" as const,
      },
    ],
  };
  expect(
    discoverKitOperations({ ...input, trustedEditors: registry })[0].stage,
  ).toBe("published");
  expect(
    discoverKitOperations({
      ...input,
      trustedEditors: { schema_version: 1, editors: [] },
    })[0].retry?.failure.kind,
  ).toBe("permanent");
});

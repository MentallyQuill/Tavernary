import { expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { createPreparedPublicationContext } from "../../scripts/automation/publication-context.mjs";
import { createPreparedKitRecord } from "../../scripts/automation/kit-publication-context.mjs";
import { discoverKitOperations } from "../../scripts/automation/kit-operations.mjs";
import { kitInventoryFixture } from "../helpers/automation-fixtures";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
function fixture(withdrawal = false) {
  const input = kitInventoryFixture({
    operation: withdrawal ? "withdrawal" : "create",
  });
  const operations = discoverKitOperations(input);
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const state: AutomationInventoryState = {
    root: process.cwd(),
    repository: "MentallyQuill/Tavernary",
    publisherActorId: input.publisherActorId,
    nowMs: input.nowMs,
    operations,
    receipts: [],
    remote: {
      issues: input.issues as never,
      pulls: [],
      runs: [],
      mainHeadSha: revision,
    },
    local: {
      revision,
      kits: input.kits,
      projects: input.projects,
      sources: Object.values(input.sourcesById),
      snapshots: Object.values(input.snapshotsBySourceId),
      blockedUsers: input.blockedUsers,
      kitSnapshots: [],
      trustedEditors: { schema_version: 1, editors: [] },
    },
  };
  return { state, operation: operations[0] };
}
test("a Kit result remains bound to the approved issue, numeric author, composition, and exact record path", async () => {
  const { state, operation } = fixture();
  const context = await createPreparedPublicationContext({ state, operation });
  const kit = createPreparedKitRecord({ state, operation });
  const path = `data/registry/kits/${kit.id}.json`;
  expect(context.authorId).toBe(1);
  expect(context.allowedPaths).toContain(path);
  expect(context.validateContent(path, kit)).toBe(true);
  expect(
    context.validateContent(path, {
      ...kit,
      author: { ...kit.author, github_user_id: 99 },
    }),
  ).toBe(false);
  expect(
    context.validateContent(path, { ...kit, project_ids: ["foreign-project"] }),
  ).toBe(false);
  expect(
    context.validateContent(path, { ...kit, source_issue_number: 999 }),
  ).toBe(false);
  expect(
    context.validateContent("data/registry/kits/foreign-kit.json", kit),
  ).toBe(false);
});
test("a late Kit issue edit or loss of author identity blocks its prepared result", async () => {
  const { state, operation } = fixture();
  state.remote.issues[0].user!.id = 99;
  await expect(
    createPreparedPublicationContext({ state, operation }),
  ).rejects.toThrow();
});
test("a withdrawal artifact can write only the authorized tombstone and cannot alter the Kit", async () => {
  const { state, operation } = fixture(true);
  const context = await createPreparedPublicationContext({ state, operation });
  const kit = createPreparedKitRecord({ state, operation });
  const path = `data/registry/kits/${kit.id}.json`;
  expect(context.validateContent(path, kit)).toBe(true);
  expect(kit.status).toBe("withdrawn");
  expect(context.validateContent(path, { ...kit, status: "published" })).toBe(
    false,
  );
  expect(
    context.validateContent(path, {
      ...kit,
      title: "Altered during withdrawal",
    }),
  ).toBe(false);
});
test("newly manual, declined, or unadmitted Kit requests cannot bypass existing intake gates", async () => {
  for (const label of ["needs-maintainer-review", "submission-declined"]) {
    const { state, operation } = fixture();
    state.remote.issues[0].labels.push(label as never);
    await expect(
      createPreparedPublicationContext({ state, operation }),
    ).rejects.toThrow();
  }
  const { state, operation } = fixture();
  state.remote.issues[0].labels = state.remote.issues[0].labels.filter(
    (label) =>
      (typeof label === "string" ? label : label.name) !== "issue-admitted",
  );
  await expect(
    createPreparedPublicationContext({ state, operation }),
  ).rejects.toThrow();
});
test("a currently trusted staff edit preserves Kit authorship and fails after staff authority is revoked", async () => {
  const input = kitInventoryFixture({ operation: "edit" });
  input.issues[0].user = { id: 2625904, login: "MentallyQuill", type: "User" };
  input.issues[0].author_association = "OWNER";
  input.issues[0].body = input.issues[0].body.replace(
    "Example Kit",
    "Updated Example Kit",
  );
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
  const { state } = fixture();
  state.remote.issues = input.issues as never;
  state.local.kits = input.kits;
  state.local.trustedEditors = trustedEditors;
  state.operations = discoverKitOperations({ ...input, trustedEditors });
  const operation = state.operations[0];
  const context = await createPreparedPublicationContext({ state, operation });
  const kit = createPreparedKitRecord({ state, operation });
  expect(kit.author.github_user_id).toBe(1);
  expect(kit.title).toBe("Updated Example Kit");
  expect(context.authorId).toBe(2625904);
  expect(
    context.validateContent(`data/registry/kits/${kit.id}.json`, kit),
  ).toBe(true);
  state.local.trustedEditors = { schema_version: 1, editors: [] };
  await expect(
    createPreparedPublicationContext({ state, operation }),
  ).rejects.toThrow();
});

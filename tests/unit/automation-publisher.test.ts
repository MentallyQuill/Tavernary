import { expect, test } from "vitest";
import { publishCanonicalBatch } from "../../scripts/automation/publish.mjs";
import { publisherFixture } from "../helpers/automation-fixtures";

test("a cancelled worker after merge does not merge again", async () => {
  const effects = publisherFixture({ alreadyMerged: true });
  const result = await publishCanonicalBatch(effects.input);
  expect(effects.merges).toHaveLength(0);
  expect(effects.receipts).toHaveLength(1);
  expect(result.recovered).toBe(1);
});
test("publication records a merge only after a fresh canonical proof", async () => {
  const effects = publisherFixture();
  const result = await publishCanonicalBatch(effects.input);
  expect(effects.merges).toHaveLength(1);
  expect(effects.receipts[0].operation.stage).toBe("published");
  expect(result.published).toBe(1);
});

test("lost persistence after a merge recovers without another merge", async () => {
  const effects = publisherFixture();
  const persist = effects.input.persist;
  effects.input.persist = async () => {
    throw new Error("temporary persistence outage");
  };
  await expect(publishCanonicalBatch(effects.input)).rejects.toThrow();
  expect(effects.merges).toHaveLength(1);
  effects.input.persist = persist;
  await publishCanonicalBatch(effects.input);
  expect(effects.merges).toHaveLength(1);
  expect(effects.receipts).toHaveLength(1);
});
test("missing canonical proof after an apparent merge cannot record publication", async () => {
  const effects = publisherFixture();
  effects.input.merge = async () => ({ sha: "d".repeat(40) });
  await expect(publishCanonicalBatch(effects.input)).rejects.toThrow();
  expect(effects.receipts).toEqual([]);
});
test("a main advance during final validation prevents the stale write", async () => {
  const effects = publisherFixture();
  effects.input.validate = async (action) => {
    effects.state.mainSha = "e".repeat(40);
    return { action: "ready", publication: action };
  };
  const result = await publishCanonicalBatch(effects.input);
  expect(effects.merges).toEqual([]);
  expect(result.regenerated).toBe(1);
  expect(effects.receipts).toEqual([]);
});
test("current confirmation progress never regresses during recovered publication bookkeeping", async () => {
  const effects = publisherFixture({ alreadyMerged: true });
  effects.state.operations[0].stage = "deployment-confirmed";
  effects.state.operations[0].expectedSha = effects.state.mainSha;
  await publishCanonicalBatch(effects.input);
  expect(effects.receipts[0].operation.stage).toBe("deployment-confirmed");
});
test("recovered finalized operations preserve their terminal time and avoid heartbeat receipts", async () => {
  const effects = publisherFixture({ alreadyMerged: true });
  effects.state.operations[0].stage = "finalized";
  effects.state.operations[0].expectedSha = effects.state.mainSha;
  const completedAt = new Date(effects.input.nowMs - 60_000).toISOString();
  effects.state.receipts = [
    {
      schema_version: 1,
      operation: effects.state.operations[0],
      updatedAt: completedAt,
      completedAt,
    },
  ];
  await publishCanonicalBatch(effects.input);
  expect(effects.receipts).toHaveLength(0);
});
test.each(["wait", "reject", "regenerate"] as const)(
  "final authority decision %s produces no canonical effect",
  async (action) => {
    const effects = publisherFixture();
    effects.input.validate = async () => ({
      action,
      reasonCode: "current-state-changed",
    });
    await publishCanonicalBatch(effects.input);
    expect(effects.merges).toEqual([]);
    expect(effects.receipts).toEqual([]);
  },
);
test("revalidation cannot substitute another checked head", async () => {
  const effects = publisherFixture();
  effects.input.validate = async (action) => ({
    action: "ready",
    publication: {
      ...action,
      expectedHeadSha: "e".repeat(40),
    } as typeof action,
  });
  await expect(publishCanonicalBatch(effects.input)).rejects.toThrow();
  expect(effects.merges).toEqual([]);
});

import { expect, test } from "vitest";
import { metadataMaintenanceFixture } from "../helpers/automation-fixtures";
import { acquirePreparedAdvisoryData } from "../../scripts/automation/advisory-preparation.mjs";

test("advisory provider failures retain the typed circuit diagnostic", async () => {
  const fixture = await metadataMaintenanceFixture();
  const operation = fixture.state.operations.find(
    (value) => value.identity.kind === "advisory",
  )!;
  await expect(
    acquirePreparedAdvisoryData({
      state: fixture.state,
      operation,
      options: {
        observe: fixture.observe,
        provider: {
          review: async () => {
            throw Object.assign(new Error("untrusted response text"), {
              code: "provider-authentication-failed",
            });
          },
        },
      },
    }),
  ).rejects.toMatchObject({ code: "provider-authentication-failed" });
});

test("a successful advisory emits only non-blocking policy state", async () => {
  const fixture = await metadataMaintenanceFixture();
  const operation = fixture.state.operations.find(
    (value) => value.identity.kind === "advisory",
  )!;
  const outputs = await acquirePreparedAdvisoryData({
    state: fixture.state,
    operation,
    options: {
      observe: fixture.observe,
      provider: {
        review: async () => ({
          status: "clear",
          category: null,
          explanation: null,
        }),
      },
    },
  });
  expect(Object.keys(outputs)).toEqual([
    `data/snapshots/policy-review/${fixture.project.id}.json`,
  ]);
  expect(JSON.parse(Object.values(outputs)[0]).status).toBe("clear");
  expect(fixture.project.listing_status).toBe("active");
});

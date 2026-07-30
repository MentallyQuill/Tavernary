import { expect, test, vi } from "vitest";

import { preserveCatalogSummary } from "../../scripts/catalog/catalog-copy-preservation.mjs";

test("degrades verified manual owner copy after one invalid repair", async () => {
  const copySummary = vi
    .fn()
    .mockResolvedValueOnce({
      status: "accepted",
      summary: "",
    })
    .mockResolvedValueOnce({
      status: "accepted",
      summary: "",
    });

  await expect(
    preserveCatalogSummary({
      authorityType: "repository-owner",
      submittedSummary: "Owner wording stays exact.",
      protectedTerms: ["Owner"],
      copySummary,
    }),
  ).resolves.toEqual({
    mode: "preserve",
    reviewStatus: "unavailable",
    reasonCode: "copy-review-unavailable",
    submittedSummary: "Owner wording stays exact.",
    publishedSummary: "Owner wording stays exact.",
    copyResult: null,
  });
  expect(copySummary).toHaveBeenCalledTimes(2);
  expect(copySummary.mock.calls[1]?.[0]).toMatchObject({
    repair: {
      reasonCode: "output-invalid",
      message: expect.stringContaining(
        "copy result must contain exactly the required properties",
      ),
    },
  });
});

test("degrades verified manual owner copy when provider transport fails", async () => {
  const copySummary = vi
    .fn()
    .mockRejectedValue(new Error("upstream connection failed"));

  await expect(
    preserveCatalogSummary({
      authorityType: "tavernary-staff",
      submittedSummary: "Staff wording stays exact.",
      copySummary,
    }),
  ).resolves.toMatchObject({
    reviewStatus: "unavailable",
    reasonCode: "copy-review-unavailable",
    submittedSummary: "Staff wording stays exact.",
    publishedSummary: "Staff wording stays exact.",
    copyResult: null,
  });
  expect(copySummary).toHaveBeenCalledOnce();
});

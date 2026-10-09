import { expect, test } from "vitest";
import { automationDataDigests } from "../../scripts/automation/data-digests.mjs";
import { verifiedAutomationDeployments } from "../../scripts/automation/data-digests.mjs";

test("volatile generation times do not manufacture new canonical deployment work", () => {
  const input = {
    catalog: {
      schemaVersion: 8,
      generatedAt: "2026-10-07T12:00:00Z",
      tagVocabulary: [],
      projects: [{ id: "example" }],
      kits: [],
    },
    targets: {
      schema_version: 3,
      generated_at: "2026-10-07T12:00:00Z",
      repositories: [{ source_id: "github-42", target_sha: "a".repeat(40) }],
    },
  };
  const original = automationDataDigests(input);
  input.catalog.generatedAt = "2026-10-08T12:00:00Z";
  input.targets.generated_at = input.catalog.generatedAt;
  expect(automationDataDigests(input)).toEqual(original);
  input.targets.repositories[0].target_sha = "b".repeat(40);
  expect(automationDataDigests(input).targetDigest).not.toBe(
    original.targetDigest,
  );
});

test("deployment confirmation requires complete matching proof and trusted main ancestry", () => {
  const input = {
    revision: "b".repeat(40),
    catalogDigest: "c".repeat(64),
    targetDigest: "d".repeat(64),
    isAncestor: () => true,
  };
  const deployment = {
    status: "confirmed" as const,
    sourceSha: "a".repeat(40),
    bundleDigest: "e".repeat(64),
    confirmation: {
      sourceSha: "a".repeat(40),
      catalogDigest: input.catalogDigest,
      targetDigest: input.targetDigest,
      buildDigest: "e".repeat(64),
      essentialSmokePassed: true,
    },
  };
  expect(
    verifiedAutomationDeployments({ ...input, deployments: [deployment] }),
  ).toEqual([deployment.sourceSha]);
  expect(
    verifiedAutomationDeployments({
      ...input,
      deployments: [deployment],
      isAncestor: () => false,
    }),
  ).toEqual([]);
  expect(
    verifiedAutomationDeployments({
      ...input,
      deployments: [
        {
          ...deployment,
          bundleDigest: undefined,
          confirmation: { ...deployment.confirmation, buildDigest: undefined },
        },
      ],
    }),
  ).toEqual([]);
  expect(
    verifiedAutomationDeployments({
      ...input,
      deployments: [
        {
          ...deployment,
          confirmation: {
            ...deployment.confirmation,
            targetDigest: "f".repeat(64),
          },
        },
      ],
    }),
  ).toEqual([]);
  expect(
    verifiedAutomationDeployments({
      ...input,
      deployments: [
        {
          ...deployment,
          confirmation: {
            ...deployment.confirmation,
            sourceSha: "f".repeat(40),
          },
        },
      ],
    }),
  ).toEqual([]);
});

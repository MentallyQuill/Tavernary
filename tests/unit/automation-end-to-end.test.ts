import { expect, test } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { automationCanary } from "../helpers/automation-canary";

test.each(["project", "owner-request", "kit", "refresh"] as const)(
  "%s recovers lost publication, deployment and finalization handoffs after a 72-hour outage exactly once",
  async (kind) => {
    const canary = await automationCanary({ kind, outageHours: 72 });
    try {
      await canary.recover();
      expect(canary.effects()).toMatchObject({
        canonicalPublications: 1,
        confirmedDeployments: 1,
        finalizations: 1,
        authorityViolations: 0,
      });
      const completed = canary.effects();
      await canary.recover();
      expect(canary.effects()).toEqual(completed);
      expect(canary.operation().stage).toBe("finalized");
      if (kind !== "refresh") expect(canary.issueState().state).toBe("closed");
      await mkdir(".tmp", { recursive: true });
      await writeFile(
        `.tmp/automation-canary-effects-${kind}.json`,
        JSON.stringify(
          {
            fixture: true,
            kind,
            outageHours: 72,
            operation: canary.operation(),
            counts: canary.effects(),
            observedEffects: canary.observedEffects(),
          },
          null,
          2,
        ),
      );
    } finally {
      await canary.close();
    }
  },
);

test.each([
  "manual",
  "owner-decline",
  "foreign-publisher",
  "changed-input",
] as const)(
  "recovery respects %s before any canonical mutation",
  async (guard) => {
    const canary = await automationCanary({
      kind: "project",
      guard,
      outageHours: 72,
    });
    try {
      await canary.recover();
      expect(canary.effects()).toMatchObject({
        canonicalPublications: 0,
        confirmedDeployments: 0,
        finalizations: 0,
        authorityViolations: 0,
      });
    } finally {
      await canary.close();
    }
  },
);

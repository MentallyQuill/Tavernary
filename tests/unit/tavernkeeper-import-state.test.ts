import { describe, expect, test } from "vitest";

import {
  initialTavernKeeperImportState,
  migrateTavernKeeperImportState,
  reportSynthesisIncidentKey,
  validateTavernKeeperImportState,
} from "../../scripts/security/tavernkeeper-import-state.mjs";

const reportId = "a".repeat(64);
const targetSha = "b".repeat(40);
const at = "2026-08-04T12:00:00.000Z";

function quarantine(overrides: Record<string, unknown> = {}) {
  return {
    report_id: reportId,
    report_digest: reportId,
    repository_id: 42,
    repository: "owner/repo",
    target_sha: targetSha,
    synthesis_policy_version: "2",
    diagnostic: "count_mismatch",
    first_failed_at: at,
    last_failed_at: at,
    attempts: 1,
    ...overrides,
  };
}

describe("TavernKeeper report import quarantine state", () => {
  test("validates an empty V2 state and one strict quarantine", () => {
    expect(initialTavernKeeperImportState(at)).toEqual({
      schema_version: 2,
      updated_at: at,
      quarantines: [],
    });
    expect(
      validateTavernKeeperImportState({
        schema_version: 2,
        updated_at: at,
        quarantines: [quarantine()],
      }),
    ).toMatchObject({ quarantines: [quarantine()] });
  });

  test.each([
    ["duplicate identity", [quarantine(), quarantine()]],
    [
      "raw message field",
      [quarantine({ message: "generated provider prose" })],
    ],
    ["invalid digest", [quarantine({ report_digest: "not-a-digest" })]],
    ["invalid timestamp", [quarantine({ last_failed_at: "tomorrow" })]],
    [
      "unsorted rows",
      [
        quarantine({
          report_id: "f".repeat(64),
          report_digest: "f".repeat(64),
        }),
        quarantine(),
      ],
    ],
  ])("rejects %s", (_label, quarantines) => {
    expect(() =>
      validateTavernKeeperImportState({
        schema_version: 2,
        updated_at: at,
        quarantines,
      }),
    ).toThrow(/import state|quarantine/u);
  });

  test("migrates the live V1 cooldown row without preserving raw output", () => {
    const migrated = migrateTavernKeeperImportState(
      {
        schema_version: 1,
        updated_at: at,
        source_generated_at: at,
        next_ticket: 3,
        pending: [
          {
            report_id: reportId,
            repository_id: 42,
            target_sha: targetSha,
            ticket: 2,
            consecutive_failures: 2,
            total_failures: 2,
            not_before: "2026-08-04T12:30:00.000Z",
            last_error_code: "REPORT_SYNTHESIS_FAILED",
            last_failed_at: at,
            chronic: false,
          },
        ],
      },
      {
        reports: [
          {
            report_id: reportId,
            report_digest: reportId,
            repository_id: 42,
            repository: "owner/repo",
            target_sha: targetSha,
          },
        ],
      },
      at,
    );

    expect(migrated).toMatchObject({
      schema_version: 2,
      quarantines: [
        {
          report_digest: reportId,
          synthesis_policy_version: "1",
          diagnostic: "provider_response_invalid",
          attempts: 2,
        },
      ],
    });
    expect(JSON.stringify(migrated)).not.toContain("not_before");
  });

  test("keys incidents by report digest and synthesis policy", () => {
    const key = reportSynthesisIncidentKey(reportId, "2");
    expect(key).toMatch(/^[0-9a-f]{64}$/u);
    expect(reportSynthesisIncidentKey(reportId, "2")).toBe(key);
    expect(reportSynthesisIncidentKey(reportId, "3")).not.toBe(key);
    expect(reportSynthesisIncidentKey("c".repeat(64), "2")).not.toBe(key);
  });
});

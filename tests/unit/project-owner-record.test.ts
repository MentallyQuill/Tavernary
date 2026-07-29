import { expect, test } from "vitest";

import {
  fingerprintProjectRecord,
  fingerprintSourceRecord,
} from "@/features/help/project-owner-record.mjs";

test("fingerprints the parsed project record with JSON.stringify ordering", () => {
  expect(
    fingerprintProjectRecord({
      schema_version: 5,
      id: "alpha",
      name: "Alpha",
    }),
  ).toBe("c4bc1455a631edbd85b2889059121d1b3cea24b7194746253f5d108bc71d38c5");
});

test("does not mutate the record while fingerprinting it", () => {
  const record = {
    id: "alpha",
    source: { type: "github", repository: "Owner/Alpha", repository_id: 42 },
  };
  const before = structuredClone(record);

  fingerprintProjectRecord(record);

  expect(record).toEqual(before);
});

test("fingerprints a source independently from its sibling cards", () => {
  const source = {
    schema_version: 1,
    id: "github-42",
    type: "github",
    repository: "Owner/Alpha",
    repository_id: 42,
    status: "active",
    status_reason: null,
    refresh_policy: "automatic",
  };
  expect(fingerprintSourceRecord(source)).toMatch(/^[a-f0-9]{64}$/u);
  expect(fingerprintSourceRecord(source)).not.toBe(
    fingerprintProjectRecord({ id: "owner-alpha", source_id: "github-42" }),
  );
});

import { expect, test } from "vitest";

import {
  catalogAttribution,
  isBotOrAiAccount,
} from "@/lib/github/contributors";

test("classifies GitHub bots and approved Claude username forms", () => {
  const accounts = [
    { login: "alice", type: "User" },
    { login: "release-agent", type: "Bot" },
    { login: "dependabot[bot]", type: "User" },
    { login: "claude", type: "User" },
    { login: "Claude-Code", type: "User" },
    { login: "claude_assistant", type: "User" },
  ];

  expect(accounts.map(isBotOrAiAccount)).toEqual([
    false,
    true,
    true,
    true,
    true,
    true,
  ]);
});

test("derives current attribution while excluding the owner from contributors", () => {
  expect(
    catalogAttribution("MentallyQuill", {
      accounts: [
        { login: "mentallyquill", type: "User" },
        { login: "Alice", type: "User" },
        { login: "Claude", type: "User" },
        { login: "dependabot[bot]", type: "Bot" },
      ],
      stale_since: null,
    }),
  ).toEqual({
    owner: "MentallyQuill",
    contributors: [
      { login: "Alice", botOrAi: false },
      { login: "Claude", botOrAi: true },
      { login: "dependabot[bot]", botOrAi: true },
    ],
    humanContributorCount: 1,
    status: "current",
  });
});

test("marks attribution pending when contributor facts are absent", () => {
  expect(catalogAttribution("MentallyQuill", undefined)).toEqual({
    owner: "MentallyQuill",
    contributors: [],
    humanContributorCount: 0,
    status: "pending",
  });
});

test("marks attribution stale when the last contributor refresh failed", () => {
  expect(
    catalogAttribution("MentallyQuill", {
      accounts: [{ login: "Alice", type: "User" }],
      stale_since: "2026-07-25T00:00:00.000Z",
    }).status,
  ).toBe("stale");
});

test("marks an incomplete fork baseline as partial", () => {
  expect(
    catalogAttribution("aikohanasaki", {
      accounts: [
        { login: "aikohanasaki", type: "User" },
        { login: "LeRobber", type: "User" },
      ],
      method: "merged-pull-requests",
      baseline_completed_at: null,
      stale_since: null,
    }),
  ).toEqual({
    owner: "aikohanasaki",
    contributors: [{ login: "LeRobber", botOrAi: false }],
    humanContributorCount: 1,
    status: "partial",
  });
});

test("stale takes precedence over a partial fork baseline", () => {
  expect(
    catalogAttribution("aikohanasaki", {
      accounts: [{ login: "LeRobber", type: "User" }],
      method: "merged-pull-requests",
      baseline_completed_at: null,
      stale_since: "2026-07-27T00:00:00.000Z",
    }).status,
  ).toBe("stale");
});

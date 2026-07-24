import { expect, test } from "vitest";

import { calculateActivity, classifyCommit } from "@/lib/github/activity";

test("excludes documentation and lockfile-only commits", () => {
  expect(classifyCommit(["README.md"])).toBe("excluded");
  expect(classifyCommit(["package-lock.json"])).toBe("excluded");
  expect(classifyCommit(["vendor/runtime.ts"])).toBe("excluded");
  expect(classifyCommit(["src/runtime.ts", "README.md"])).toBe("meaningful");
});

test("excludes merge-only and whitespace-only changes", () => {
  expect(classifyCommit(["src/index.ts"], { mergeOnly: true })).toBe(
    "excluded",
  );
  expect(
    classifyCommit(["src/index.ts"], {
      patch: "@@ -1 +1 @@\n-   \n+\t\n",
    }),
  ).toBe("excluded");
  expect(
    classifyCommit(["src/index.ts"], {
      patch: "@@ -1 +1 @@\n-old\n+new\n",
    }),
  ).toBe("meaningful");
});

test("weights active weeks and caps commit tie points", () => {
  const activity = calculateActivity({
    now: "2026-07-23T00:00:00Z",
    commits: [
      ...Array.from({ length: 20 }, (_, index) => ({
        sha: `current-${index}`,
        committedAt: "2026-07-22T00:00:00Z",
        files: ["src/index.ts"],
      })),
      {
        sha: "older",
        committedAt: "2026-07-14T00:00:00Z",
        files: ["src/index.ts"],
      },
    ],
  });
  expect(activity.activeWeeks12).toBe(2);
  expect(activity.strength).toBe(1200 + 5 + 1100 + 1);
});

test("marks a project dormant only after 84 days", () => {
  const boundary = calculateActivity({
    now: "2026-07-23T00:00:00Z",
    commits: [
      {
        sha: "boundary",
        committedAt: "2026-04-30T00:00:00Z",
        files: ["src/index.ts"],
      },
    ],
  });
  expect(boundary.dormant).toBe(false);
});

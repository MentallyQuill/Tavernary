import { expect, test } from "vitest";

import { classifyCommit } from "@/lib/github/activity";

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

test("treats root license files as excluded source paths", () => {
  expect(classifyCommit(["LICENSE"])).toBe("excluded");
  expect(classifyCommit(["COPYING.md"])).toBe("excluded");
});

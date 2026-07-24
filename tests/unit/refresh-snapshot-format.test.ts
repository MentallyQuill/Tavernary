import { expect, test } from "vitest";

import * as refreshModule from "../../scripts/catalog/refresh-github.mjs";

test("serializes refreshed snapshots in repository Prettier format", async () => {
  const formatSnapshot = (
    refreshModule as {
      formatSnapshot?: (snapshot: unknown) => Promise<string>;
    }
  ).formatSnapshot;

  expect(formatSnapshot).toBeTypeOf("function");
  if (!formatSnapshot) return;

  const serialized = await formatSnapshot({
    activity: {
      weekly_meaningful_commits: [65, 58, 77, 122, 0, 0, 0, 0, 0, 0, 0, 0],
    },
  });

  expect(serialized).toContain(
    '"weekly_meaningful_commits": [65, 58, 77, 122, 0, 0, 0, 0, 0, 0, 0, 0]',
  );
  expect(serialized.endsWith("\n")).toBe(true);
});

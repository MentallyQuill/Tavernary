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
      source_weeks: [
        {
          week_start: "2026-07-20",
          latest_at: "2026-07-24T00:00:00.000Z",
          precision: "interval",
        },
      ],
    },
  });

  expect(serialized).toContain('"week_start": "2026-07-20"');
  expect(serialized.endsWith("\n")).toBe(true);
});

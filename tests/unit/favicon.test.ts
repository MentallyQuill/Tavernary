import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("site favicon", () => {
  test("declares the favicon assets in the root metadata", async () => {
    const layout = await readFile("src/app/layout.tsx", "utf8");

    expect(layout).toContain('"./favicon.ico"');
    expect(layout).toContain('"./tavernary-favicon-32.png"');
    expect(layout).toContain('"./tavernary-favicon-16.png"');
    expect(layout).toContain('"./tavernary-favicon-192.png"');
    expect(layout).toContain('"./tavernary-favicon-512.png"');
    expect(layout).toContain('"./apple-touch-icon.png"');
  });
});

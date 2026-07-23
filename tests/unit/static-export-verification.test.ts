import { describe, expect, test } from "vitest";

import { verifyStaticExport } from "../../scripts/verify-static-export.mjs";

const heading = "<h1>5 projects</h1>";

describe("verifyStaticExport", () => {
  test("accepts root Next assets when no base path is configured", () => {
    expect(() =>
      verifyStaticExport(
        `${heading}<script src=\"/_next/static/app.js\"></script>`,
        "",
      ),
    ).not.toThrow();
  });

  test("requires prefixed Next assets and rejects root-only assets for a project page", () => {
    expect(() =>
      verifyStaticExport(
        `${heading}<script src=\"/Tavernary/_next/static/app.js\"></script>`,
        "/Tavernary",
      ),
    ).not.toThrow();

    expect(() =>
      verifyStaticExport(
        `${heading}<script src=\"/_next/static/app.js\"></script>`,
        "/Tavernary",
      ),
    ).toThrow("root-only Next.js asset URLs");

    expect(() => verifyStaticExport(heading, "/Tavernary")).toThrow(
      "configured base path",
    );
  });
});

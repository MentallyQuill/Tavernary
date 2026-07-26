import { describe, expect, test } from "vitest";

import { verifyStaticExport } from "../../scripts/verify-static-export.mjs";

const heading = (count: number) => `<h1>${count} projects</h1>`;

describe("verifyStaticExport", () => {
  test("accepts a catalog heading split by React server-rendering comments", () => {
    expect(() =>
      verifyStaticExport(
        '<h1>211<!-- --> <!-- -->projects</h1><script src="/_next/static/app.js"></script>',
        "",
      ),
    ).not.toThrow();
  });

  test("accepts the full 211-project launch heading", () => {
    expect(() =>
      verifyStaticExport(
        `${heading(211)}<script src="/_next/static/app.js"></script>`,
        "",
      ),
    ).not.toThrow();
  });

  test("accepts root Next assets when no base path is configured", () => {
    expect(() =>
      verifyStaticExport(
        `${heading(211)}<script src=\"/_next/static/app.js\"></script>`,
        "",
      ),
    ).not.toThrow();
  });

  test("rejects repository-prefixed Next assets for a root deployment", () => {
    expect(() =>
      verifyStaticExport(
        `${heading(214)}<script src=\"/Tavernary/_next/static/app.js\"></script>`,
        "",
      ),
    ).toThrow("root-relative Next.js asset URLs");

    expect(() => verifyStaticExport(heading(211), "")).toThrow(
      "root-relative Next.js asset URLs",
    );
  });

  test("requires prefixed Next assets and rejects root-only assets for a project page", () => {
    expect(() =>
      verifyStaticExport(
        `${heading(211)}<script src=\"/Tavernary/_next/static/app.js\"></script>`,
        "/Tavernary",
      ),
    ).not.toThrow();

    expect(() =>
      verifyStaticExport(
        `${heading(211)}<script src=\"/_next/static/app.js\"></script>`,
        "/Tavernary",
      ),
    ).toThrow("root-only Next.js asset URLs");

    expect(() => verifyStaticExport(heading(211), "/Tavernary")).toThrow(
      "configured base path",
    );
  });

  test("rejects exports that leak intake-only metadata", () => {
    expect(() =>
      verifyStaticExport(
        `${heading(211)}<div data-debug="submitted_at catalog_intake"></div><script src="/_next/static/app.js"></script>`,
        "",
      ),
    ).toThrow("intake-only metadata");
  });
});

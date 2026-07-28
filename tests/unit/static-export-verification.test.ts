import { describe, expect, test } from "vitest";

import { verifyStaticExport } from "../../scripts/verify-static-export.mjs";

const homepageTitle = "Tavernary — SillyTavern Tools";
const homepageDescription =
  "Discover open-source tools for SillyTavern and AI roleplay. Explore extensions, frontends, presets, and community-built Kits.";
const homepageMetadata = [
  `<title>${homepageTitle}</title>`,
  `<meta name="description" content="${homepageDescription}"/>`,
  `<meta property="og:description" content="${homepageDescription}"/>`,
  `<meta name="twitter:description" content="${homepageDescription}"/>`,
].join("");
const heading = (count: number) =>
  `${homepageMetadata}<h1>${count} projects</h1>`;

describe("verifyStaticExport", () => {
  test("accepts a catalog heading split by React server-rendering comments", () => {
    expect(() =>
      verifyStaticExport(
        `${homepageMetadata}<h1>37<!-- --> <!-- -->projects</h1><script src="/_next/static/app.js"></script>`,
        "",
      ),
    ).not.toThrow();
  });

  test("accepts any numeric project heading", () => {
    expect(() =>
      verifyStaticExport(
        `${heading(37)}<script src="/_next/static/app.js"></script>`,
        "",
      ),
    ).not.toThrow();
  });

  test("accepts root Next assets when no base path is configured", () => {
    expect(() =>
      verifyStaticExport(
        `${heading(37)}<script src=\"/_next/static/app.js\"></script>`,
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

    expect(() => verifyStaticExport(heading(37), "")).toThrow(
      "root-relative Next.js asset URLs",
    );
  });

  test("requires prefixed Next assets and rejects root-only assets for a project page", () => {
    expect(() =>
      verifyStaticExport(
        `${heading(37)}<script src=\"/Tavernary/_next/static/app.js\"></script>`,
        "/Tavernary",
      ),
    ).not.toThrow();

    expect(() =>
      verifyStaticExport(
        `${heading(37)}<script src=\"/_next/static/app.js\"></script>`,
        "/Tavernary",
      ),
    ).toThrow("root-only Next.js asset URLs");

    expect(() => verifyStaticExport(heading(37), "/Tavernary")).toThrow(
      "configured base path",
    );
  });

  test("rejects exports that leak intake-only metadata", () => {
    expect(() =>
      verifyStaticExport(
        `${heading(37)}<div data-debug="submitted_at catalog_intake"></div><script src="/_next/static/app.js"></script>`,
        "",
      ),
    ).toThrow("intake-only metadata");
  });

  test("rejects stale or incomplete homepage metadata", () => {
    const rootAsset = '<script src="/_next/static/app.js"></script>';

    expect(() =>
      verifyStaticExport(
        `${heading(37).replace(homepageTitle, "Tavernary")}${rootAsset}`,
        "",
      ),
    ).toThrow("homepage title and description metadata");

    expect(() =>
      verifyStaticExport(
        `${heading(37).replace(
          `<meta property="og:description" content="${homepageDescription}"/>`,
          "",
        )}${rootAsset}`,
        "",
      ),
    ).toThrow("homepage title and description metadata");
  });
});

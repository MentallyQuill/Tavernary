import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  verifyHelpStaticRoutes,
  verifyStaticExport,
} from "../../scripts/verify-static-export.mjs";

const heading = (count: number) => `<h1>${count} projects</h1>`;

const temporaryExports: string[] = [];

afterEach(() => {
  for (const directory of temporaryExports.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function helpExport({
  omit,
  securityHtml = "<main>Private report</main>",
}: {
  omit?: string;
  securityHtml?: string;
} = {}) {
  const outputDirectory = mkdtempSync(
    resolve(tmpdir(), "tavernary-help-export-"),
  );
  temporaryExports.push(outputDirectory);
  for (const route of [
    "help",
    "help/manage-project",
    "help/report-project",
    "help/report-website",
    "help/report-kit",
    "help/other",
  ]) {
    if (route === omit) continue;
    const directory = resolve(outputDirectory, route);
    mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(directory, "index.html"), "<main>Help</main>");
  }
  const securityDirectory = resolve(outputDirectory, "help/security");
  mkdirSync(securityDirectory, { recursive: true });
  writeFileSync(resolve(securityDirectory, "index.html"), securityHtml);
  return outputDirectory;
}

describe("verifyStaticExport", () => {
  test("accepts a catalog heading split by React server-rendering comments", () => {
    expect(() =>
      verifyStaticExport(
        '<h1>37<!-- --> <!-- -->projects</h1><script src="/_next/static/app.js"></script>',
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

  test("requires the complete Help route inventory and keeps security private", async () => {
    await expect(verifyHelpStaticRoutes(helpExport())).resolves.toBeUndefined();
    await expect(
      verifyHelpStaticRoutes(helpExport({ omit: "help/report-kit" })),
    ).rejects.toThrow(/help[\\/]report-kit[\\/]index.html/u);
    await expect(
      verifyHelpStaticRoutes(
        helpExport({ securityHtml: '<a href="/issues/new">Public issue</a>' }),
      ),
    ).rejects.toThrow("public issue form");
  });
});

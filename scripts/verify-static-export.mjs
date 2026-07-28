import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function configuredBasePath(environment = process.env) {
  const repositoryName = environment.GITHUB_REPOSITORY?.split("/")[1] ?? "";
  const projectPage =
    environment.GITHUB_ACTIONS === "true" &&
    repositoryName.length > 0 &&
    !repositoryName.endsWith(".github.io");

  return (
    environment.TAVERNARY_BASE_PATH ?? (projectPage ? `/${repositoryName}` : "")
  );
}

export function verifyStaticExport(html, basePath = "") {
  const renderedText = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!/\b\d+\s+projects?\b/.test(renderedText)) {
    throw new Error("Static export does not contain the catalog heading");
  }
  if (/submitted_at|catalog_intake|"status"\s*:\s*"candidate"/i.test(html)) {
    throw new Error("Static export leaks intake-only metadata");
  }

  if (!basePath) {
    const rootAsset =
      html.includes('href="/_next/') || html.includes('src="/_next/');
    const prefixedAsset = /(?:href|src)="\/(?!_next\/)[^"]+\/_next\//.test(
      html,
    );
    if (!rootAsset || prefixedAsset) {
      throw new Error(
        "Static export does not contain root-relative Next.js asset URLs",
      );
    }
    return;
  }

  if (html.includes('href="/_next/') || html.includes('src="/_next/')) {
    throw new Error("Static export contains root-only Next.js asset URLs");
  }

  const prefixedAsset = `${basePath}/_next/`;
  if (
    !html.includes(`href="${prefixedAsset}`) &&
    !html.includes(`src="${prefixedAsset}`)
  ) {
    throw new Error(
      "Static export does not contain Next.js assets for the configured base path",
    );
  }
}

const helpExportPaths = [
  "help",
  "help/manage-project",
  "help/report-project",
  "help/report-website",
  "help/report-kit",
  "help/other",
  "help/security",
];

export async function verifyHelpStaticRoutes(outputDirectory = "out") {
  for (const route of helpExportPaths) {
    await access(resolve(outputDirectory, route, "index.html"));
  }

  const securityHtml = await readFile(
    resolve(outputDirectory, "help/security/index.html"),
    "utf8",
  );
  if (securityHtml.includes("/issues/new")) {
    throw new Error(
      "Private security export must not contain a public issue form",
    );
  }
}

async function main() {
  await access("out/index.html");
  const html = await readFile("out/index.html", "utf8");
  verifyStaticExport(html, configuredBasePath());
  await verifyHelpStaticRoutes();
  console.log("Static export verified");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}

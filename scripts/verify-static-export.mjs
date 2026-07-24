import { access, readFile } from "node:fs/promises";
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

  if (!renderedText.includes("5 projects")) {
    throw new Error("Static export does not contain the catalog heading");
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

async function main() {
  await access("out/index.html");
  const html = await readFile("out/index.html", "utf8");
  verifyStaticExport(html, configuredBasePath());
  console.log("Static export verified");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}

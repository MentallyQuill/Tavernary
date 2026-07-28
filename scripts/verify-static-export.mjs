import { access, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const homepageTitle = "Tavernary · SillyTavern Tool Library";
const homepageDescription =
  "Discover open-source tools for SillyTavern and AI roleplay. Explore extensions, frontends, presets, and community-built Kits.";
const homepageMetadata = [
  `<title>${homepageTitle}</title>`,
  `<meta name="description" content="${homepageDescription}"/>`,
  `<meta property="og:description" content="${homepageDescription}"/>`,
  `<meta name="twitter:description" content="${homepageDescription}"/>`,
];

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
  if (!homepageMetadata.every((tag) => html.includes(tag))) {
    throw new Error(
      "Static export does not contain the approved homepage title and description metadata",
    );
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

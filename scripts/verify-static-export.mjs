import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import Ajv from "ajv";
import addFormats from "ajv-formats";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

export async function verifyTavernKeeperStaticExport(outputDirectory = "out") {
  const [manifest, contract] = await Promise.all([
    readFile(
      resolve(outputDirectory, "security/tavernkeeper-targets.json"),
      "utf8",
    ).then((contents) => JSON.parse(contents)),
    readFile(
      resolve(rootDirectory, "config/tavernkeeper-contract.json"),
      "utf8",
    ).then((contents) => JSON.parse(contents)),
  ]);
  const version = contract.target_manifest_schema_version;
  if (version !== 1 && version !== 2 && version !== 3)
    throw new Error("Tracked TavernKeeper target contract version is invalid");
  const schema = JSON.parse(
    await readFile(
      resolve(
        rootDirectory,
        version === 1
          ? "data/schemas/tavernkeeper-targets.schema.json"
          : `data/schemas/tavernkeeper-targets.v${version}.schema.json`,
      ),
      "utf8",
    ),
  );
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  if (!validate(manifest)) {
    throw new Error(
      `TavernKeeper target manifest is invalid: ${validate.errors
        ?.map(
          ({ instancePath, message }) => `${instancePath || "/"} ${message}`,
        )
        .join(", ")}`,
    );
  }
  if (version === 3) {
    const ranks = manifest.repositories
      .map(({ catalog_priority }) => catalog_priority.popularity_rank)
      .sort((left, right) => left - right);
    if (ranks.some((rank, index) => rank !== index + 1))
      throw new Error(
        "TavernKeeper target manifest is invalid: popularity ranks must form one complete unique sequence",
      );
  }
}

async function main() {
  await access("out/index.html");
  const html = await readFile("out/index.html", "utf8");
  verifyStaticExport(html, configuredBasePath());
  await verifyHelpStaticRoutes();
  await verifyTavernKeeperStaticExport();
  console.log("Static export verified");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}

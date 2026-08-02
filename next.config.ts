import type { NextConfig } from "next";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
const projectPage =
  process.env.GITHUB_ACTIONS === "true" &&
  repositoryName.length > 0 &&
  !repositoryName.endsWith(".github.io");
const basePath =
  process.env.TAVERNARY_BASE_PATH ?? (projectPage ? `/${repositoryName}` : "");
const turbopackRoot = process.env.TAVERNARY_TURBOPACK_ROOT;

const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  assetPrefix: basePath || undefined,
  images: { unoptimized: true },
  allowedDevOrigins: ["127.0.0.1"],
  ...(turbopackRoot ? { turbopack: { root: turbopackRoot } } : {}),
};

export default config;

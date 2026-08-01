import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { relative, resolve } from "node:path";

import { configuredBasePath } from "./verify-static-export.mjs";

const outputDirectory = resolve(
  process.env.TAVERNARY_STATIC_EXPORT_DIR ?? "out",
);
const basePath = configuredBasePath();

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function contentType(pathname) {
  const extension = pathname.slice(pathname.lastIndexOf("."));
  return contentTypes[extension] ?? "application/octet-stream";
}

function outputPath(pathname) {
  let requestPath = decodeURIComponent(pathname);
  if (basePath) {
    if (!requestPath.startsWith(`${basePath}/`)) {
      return null;
    }
    requestPath = requestPath.slice(basePath.length);
  }

  if (requestPath.endsWith("/")) {
    requestPath += "index.html";
  } else if (!requestPath.includes(".")) {
    requestPath += "/index.html";
  }

  const target = resolve(outputDirectory, `.${requestPath}`);
  const relativeTarget = relative(outputDirectory, target);
  return relativeTarget.startsWith("..") ? null : target;
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  const filePath = outputPath(requestUrl.pathname);
  if (!filePath) {
    response.writeHead(404).end();
    return;
  }

  try {
    const file = await readFile(filePath);
    response
      .writeHead(200, { "content-type": contentType(filePath) })
      .end(file);
  } catch {
    response.writeHead(404).end();
  }
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}

const port = Number(process.env.PORT ?? 3000);
server.listen(port, "127.0.0.1", () => {
  console.log(`Static export server listening on http://127.0.0.1:${port}`);
});
server.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

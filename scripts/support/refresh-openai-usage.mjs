import { resolve } from "node:path";

import { refreshOpenAiUsage } from "./openai-usage.mjs";

const outputPath = resolve("data/support/monthly-usage.json");

await refreshOpenAiUsage({
  fetch: globalThis.fetch,
  env: process.env,
  now: new Date(),
  outputPath,
});

process.stdout.write(`Updated ${outputPath}\n`);

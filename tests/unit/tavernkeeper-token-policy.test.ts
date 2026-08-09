import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test } from "vitest";
import { parse } from "yaml";

const workflowDirectory = resolve(".github/workflows");
const appTokenAction =
  "actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1";

async function workflowSources() {
  const names = (await readdir(workflowDirectory)).filter((name) =>
    name.endsWith(".yml"),
  );
  return Promise.all(
    names.map(async (name) => ({
      name,
      source: await readFile(resolve(workflowDirectory, name), "utf8"),
    })),
  );
}

function walk(value: unknown, visit: (candidate: unknown) => void) {
  visit(value);
  if (Array.isArray(value)) {
    value.forEach((child) => walk(child, visit));
    return;
  }
  if (value === null || typeof value !== "object") return;
  Object.values(value).forEach((child) => walk(child, visit));
}

test("production auth surfaces contain no installation-token format assumptions", async () => {
  const sources = await workflowSources();
  const securityScripts = (await readdir(resolve("scripts/security")))
    .filter((name) => name.endsWith(".mjs"))
    .map(async (name) => ({
      name: `scripts/security/${name}`,
      source: await readFile(resolve("scripts/security", name), "utf8"),
    }));
  const corpus = [...sources, ...(await Promise.all(securityScripts))];

  for (const { name, source } of corpus) {
    expect(source, name).not.toMatch(/X-GitHub-Stateless-S2S-Token/iu);
    expect(source, name).not.toMatch(/\bghs_/u);
    expect(source, name).not.toMatch(
      /\b(?:GH_TOKEN|GITHUB_TOKEN|TOKEN)\b[^\n]{0,120}(?:\.length|\.slice\(|\.substring\()/iu,
    );
    expect(source, name).not.toMatch(
      /\b(?:GH_TOKEN|GITHUB_TOKEN|TOKEN)\b[^\n]{0,120}(?:jwt-decode|decodeJwt|atob\(|\.split\(\s*["']\.["']\s*\))/iu,
    );
  }
  expect(sources.map(({ name }) => name)).not.toEqual(
    expect.arrayContaining([
      "tavernkeeper-token-compat.yml",
      "tavernkeeper-token-compat-receiver.yml",
    ]),
  );
});

test("App token outputs pass to GitHub consumers without mutation", async () => {
  const syntheticToken = `opaque.installation.${"x".repeat(640)}`;
  expect(syntheticToken.length).toBeGreaterThan(600);
  const documents = (await workflowSources()).map(({ name, source }) => ({
    name,
    value: parse(source),
  }));
  let tokenSteps = 0;
  let consumers = 0;

  for (const { name, value } of documents) {
    const references = new Set<string>();
    walk(value, (candidate) => {
      if (
        candidate !== null &&
        typeof candidate === "object" &&
        "uses" in candidate &&
        candidate.uses === appTokenAction &&
        "id" in candidate &&
        typeof candidate.id === "string"
      ) {
        references.add(`\${{ steps.${candidate.id}.outputs.token }}`);
        tokenSteps += 1;
      }
    });
    walk(value, (candidate) => {
      if (
        candidate !== null &&
        typeof candidate === "object" &&
        "GH_TOKEN" in candidate &&
        typeof candidate.GH_TOKEN === "string" &&
        references.has(candidate.GH_TOKEN)
      ) {
        const transported = new Map(
          [...references].map((reference) => [reference, syntheticToken]),
        ).get(candidate.GH_TOKEN);
        expect(transported, name).toBe(syntheticToken);
        consumers += 1;
      }
    });
  }

  expect(tokenSteps).toBeGreaterThanOrEqual(2);
  expect(consumers).toBeGreaterThanOrEqual(2);
});

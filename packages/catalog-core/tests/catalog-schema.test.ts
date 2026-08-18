import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CatalogValidationError, parseCatalogV7 } from "../src/catalog-schema";
import { parseInstallContract } from "../src/install-contract";

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(
    await readFile(
      resolve(process.cwd(), `packages/catalog-core/fixtures/${name}.json`),
      "utf8",
    ),
  );
}

describe("parseInstallContract", () => {
  it("accepts the exact SillyTavern git contract", () => {
    const contract = {
      kind: "sillytavern-extension-git",
      repositoryUrl: "https://github.com/example/alpha.git",
      branch: null,
      manifestPath: "manifest.json",
      folderName: "alpha",
    };
    expect(parseInstallContract(contract)).toEqual(contract);
  });

  it.each([
    [
      "credentials",
      "https://user:secret@github.com/example/alpha.git",
      "alpha",
    ],
    ["query", "https://github.com/example/alpha.git?ref=main", "alpha"],
    ["fragment", "https://github.com/example/alpha.git#readme", "alpha"],
    ["scheme", "file:///example/alpha.git", "alpha"],
    ["encoded separator", "https://github.com/example%2Falpha.git", "alpha"],
    ["unsafe folder", "https://github.com/example/alpha.git", "../alpha"],
  ])("rejects %s", (_label, repositoryUrl, folderName) => {
    expect(() =>
      parseInstallContract({
        kind: "sillytavern-extension-git",
        repositoryUrl,
        branch: null,
        manifestPath: "manifest.json",
        folderName,
      }),
    ).toThrow();
  });
});

it("parses a schema-7 catalog fixture", async () => {
  const value = await fixture("catalog-v7-valid");
  expect(parseCatalogV7(value)).toEqual(value);
});

it("reports an invalid install URL at the public field path", async () => {
  const value = await fixture("catalog-v7-invalid-install-url");
  const error = (() => {
    try {
      parseCatalogV7(value);
      return null;
    } catch (cause) {
      return cause;
    }
  })();

  expect(error).toBeInstanceOf(CatalogValidationError);
  expect(error).toMatchObject({
    issues: [
      expect.objectContaining({ path: "projects[0].install.repositoryUrl" }),
    ],
  });
});

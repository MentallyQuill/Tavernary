import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test } from "vitest";
import { parse } from "yaml";

const templateDirectory = resolve(".github/ISSUE_TEMPLATE");

test("publishes valid, uniquely named issue forms", async () => {
  const files = (await readdir(templateDirectory))
    .filter((file) => file.endsWith(".yml") && file !== "config.yml")
    .sort();
  const forms = await Promise.all(
    files.map(async (file) => ({
      file,
      document: parse(await readFile(resolve(templateDirectory, file), "utf8")),
    })),
  );

  expect(forms.map(({ document }) => document.name)).toEqual([
    ...new Set(forms.map(({ document }) => document.name)),
  ]);
  for (const { document } of forms) {
    expect(document.name).toEqual(expect.any(String));
    expect(document.description).toEqual(expect.any(String));
    expect(document.title).toEqual(expect.any(String));
    expect(document.body).toEqual(expect.any(Array));
    expect(document.body.length).toBeGreaterThan(0);
  }
});

test("configures the exact five Help choices and disables blank issues", async () => {
  const config = parse(
    await readFile(resolve(templateDirectory, "config.yml"), "utf8"),
  );
  const formFiles = [
    "project-information.yml",
    "website-bug.yml",
    "help.yml",
    "other.yml",
  ];
  const formNames = await Promise.all(
    formFiles.map(async (file) => {
      const form = parse(
        await readFile(resolve(templateDirectory, file), "utf8"),
      );
      return form.name;
    }),
  );
  const chooserNames = [
    ...formNames.slice(0, 3),
    ...config.contact_links.map((link: { name: string }) => link.name),
    formNames[3],
  ];

  expect(config.blank_issues_enabled).toBe(false);
  expect(chooserNames).toEqual([
    "Report project information",
    "Report a website bug",
    "Request help",
    "Report a security vulnerability",
    "Other",
  ]);
  expect(config.contact_links[0].url).toMatch(/\/security\/policy$/);
});

test("project submissions state the source rules and required acknowledgements", async () => {
  const source = await readFile(
    resolve(templateDirectory, "project-submission.yml"),
    "utf8",
  );
  const form = parse(source);
  const fieldIds = form.body
    .map((field: { id?: string }) => field.id)
    .filter(Boolean);

  expect(fieldIds).toEqual(
    expect.arrayContaining([
      "project-name",
      "project-kind",
      "canonical-source-url",
      "frontends",
      "factual-summary",
      "primary-function",
      "capabilities",
      "supporting-context",
      "acknowledgements",
    ]),
  );
  expect(source).toContain(
    "I understand that Frontends and Extensions require a public GitHub repository.",
  );
  expect(source).toContain(
    "I understand that submission does not publish the project automatically.",
  );
  expect(source).toContain(
    "non-GitHub System Presets are locked after acceptance",
  );
});

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

test("orders the repository forms and leaves security reporting to GitHub", async () => {
  const config = parse(
    await readFile(resolve(templateDirectory, "config.yml"), "utf8"),
  );
  const formFiles = (await readdir(templateDirectory))
    .filter((file) => file.endsWith(".yml") && file !== "config.yml")
    .sort();
  const formNames = await Promise.all(
    formFiles.map(async (file) => {
      const form = parse(
        await readFile(resolve(templateDirectory, file), "utf8"),
      );
      return form.name;
    }),
  );

  expect(config.blank_issues_enabled).toBe(false);
  expect(config.contact_links ?? []).toEqual([]);
  expect(formFiles).toEqual([
    "01-project-submission.yml",
    "02-project-information.yml",
    "03-website-bug.yml",
    "04-other.yml",
  ]);
  expect(formNames).toEqual([
    "Submit a project",
    "Report project information",
    "Report a website bug",
    "Other",
  ]);
  expect(formNames).not.toContain("Request help");
  expect(formNames).not.toContain("Report a security vulnerability");
});

test("project submissions state the source rules and required acknowledgements", async () => {
  const source = await readFile(
    resolve(templateDirectory, "01-project-submission.yml"),
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

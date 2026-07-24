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
    "05-kit-submission.yml",
    "06-kit-report.yml",
    "07-kit-withdrawal.yml",
  ]);
  expect(formNames).toEqual([
    "Submit a project",
    "Report project information",
    "Report a website bug",
    "Other",
    "Submit or edit a Kit",
    "Report a Kit",
    "Withdraw a Kit",
  ]);
  expect(formNames).not.toContain("Request help");
  expect(formNames).not.toContain("Report a security vulnerability");
});

test("Kit forms contain the approved fields and contribution terms", async () => {
  const submissionSource = await readFile(
    resolve(templateDirectory, "05-kit-submission.yml"),
    "utf8",
  );
  const submission = parse(submissionSource);
  const ids = submission.body
    .map((field: { id?: string }) => field.id)
    .filter(Boolean);
  expect(ids).toEqual(
    expect.arrayContaining([
      "operation",
      "kit-id",
      "title",
      "description",
      "manifest",
      "contribution-terms",
    ]),
  );
  expect(submissionSource).toContain(
    "I created or am authorized to submit this Kit title and description, and I agree they may be published under DbCL 1.0 as part of Tavernary's ODbL 1.0 catalog.",
  );

  const report = parse(
    await readFile(resolve(templateDirectory, "06-kit-report.yml"), "utf8"),
  );
  const categories = report.body.find(
    (field: { id?: string }) => field.id === "category",
  );
  expect(categories.attributes.options).toEqual([
    "Compatibility problem",
    "Unsafe or malicious project",
    "Abusive or vulgar content",
    "Broken or removed project",
    "Misleading description",
    "Duplicate Kit",
    "Other",
  ]);
  for (const file of ["06-kit-report.yml", "07-kit-withdrawal.yml"]) {
    const source = await readFile(resolve(templateDirectory, file), "utf8");
    expect(source).toContain("id: kit-id");
    expect(source).toContain("id: share-url");
    expect(source).toMatch(/required: true/g);
  }
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

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

test("Kit submission is a readable review form without redundant machine fields", async () => {
  const submission = parse(
    await readFile(resolve(templateDirectory, "05-kit-submission.yml"), "utf8"),
  );
  const ids = submission.body
    .map((field: { id?: string }) => field.id)
    .filter(Boolean);
  expect(ids).toEqual(["kit-title", "kit-description", "manifest"]);
  expect(
    submission.body
      .filter((field: { id?: string }) => field.id)
      .map(
        (field: { attributes: { label: string } }) => field.attributes.label,
      ),
  ).toEqual(["Kit title", "Kit description", "Kit manifest"]);

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

test("project submission is a minimal three-field intake", async () => {
  const submission = parse(
    await readFile(
      resolve(templateDirectory, "01-project-submission.yml"),
      "utf8",
    ),
  );
  const fields = submission.body.filter((field: { id?: string }) => field.id);

  expect(submission.title).toBe("[Project submission]");
  expect(fields.map((field: { id: string }) => field.id)).toEqual([
    "project-type",
    "project-url",
    "additional-context",
  ]);
  expect(
    fields.map(
      (field: { attributes: { label: string } }) => field.attributes.label,
    ),
  ).toEqual(["Project Type", "Project URL", "Anything we should know?"]);
  expect(fields[0].attributes.options).toEqual([
    "Frontend",
    "Extension",
    "System Preset",
  ]);
  expect(fields[0].validations.required).toBe(true);
  expect(fields[1].validations.required).toBe(true);
  expect(fields[1].attributes.placeholder).toBe(
    "https://github.com/owner/repository",
  );
  expect(fields[2].validations?.required ?? false).toBe(false);
  expect(submission.body[0].attributes.value).toContain(
    "GitHub repository URL required for Extensions and Frontends, not for Presets.",
  );
});

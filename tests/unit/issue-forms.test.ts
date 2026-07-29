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
    "08-project-owner-request.yml",
  ]);
  expect(formNames).toEqual([
    "Submit a project",
    "Report project information",
    "Report a website bug",
    "Other",
    "Submit or edit a Kit",
    "Report a Kit",
    "Withdraw a Kit",
    "Manage a project listing",
  ]);
  expect(formNames).not.toContain("Request help");
  expect(formNames).not.toContain("Report a security vulnerability");
});

test("owner requests have an accessible readable fallback in exact review order", async () => {
  const form = parse(
    await readFile(
      resolve(templateDirectory, "08-project-owner-request.yml"),
      "utf8",
    ),
  ) as {
    body: Array<{
      type: string;
      id?: string;
      attributes?: { label?: string; description?: string };
      validations?: { required?: boolean };
    }>;
  };
  const fields = form.body.filter((field) => field.id);

  expect(fields.map((field) => field.id)).toEqual([
    "request-type",
    "project-id",
    "repository",
    "proposed-name",
    "proposed-summary",
    "supported-frontends",
    "primary-function",
    "capabilities",
    "model-families",
    "completion-formats",
    "proposed-repository",
    "explanation",
    "delist-confirmation",
    "owner-request-manifest",
  ]);
  expect(
    fields
      .filter((field) => field.validations?.required)
      .map((field) => field.id),
  ).toEqual(["request-type", "project-id", "repository"]);
  expect(fields.at(-1)).toMatchObject({
    id: "owner-request-manifest",
    type: "textarea",
    validations: { required: false },
  });
  expect(
    fields.find((field) => field.id === "request-type")?.attributes
      ?.description,
  ).toContain(
    "Edit card details; Update repository location; Delist this project",
  );
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
  const category = report.body.find(
    (field: { id?: string }) => field.id === "category",
  );
  expect(category.type).toBe("input");
  expect(category.attributes.description).toContain("Compatibility problem");
  expect(category.attributes.description).toContain("Duplicate Kit");
  for (const file of ["06-kit-report.yml", "07-kit-withdrawal.yml"]) {
    const source = await readFile(resolve(templateDirectory, file), "utf8");
    expect(source).toContain("id: kit-id");
    expect(source).toContain("id: share-url");
    expect(source).toMatch(/required: true/g);
  }
});

test("project submission is a structured fallback for automated intake", async () => {
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
    "primary-function",
    "project-name",
    "project-description",
    "supported-frontends",
    "frontend-independent",
    "additional-context",
    "supported-model-families",
    "other-model-family",
    "completion-formats",
    "project-manifest",
  ]);
  expect(
    fields.map(
      (field: { attributes: { label: string } }) => field.attributes.label,
    ),
  ).toEqual([
    "Project Type",
    "Project URL",
    "Primary function",
    "Project Name",
    "Short Description",
    "Supported frontends",
    "Frontend-independent",
    "Anything we should know?",
    "Supported model families",
    "Other model family",
    "Completion formats",
    "Project manifest",
  ]);
  expect(fields.map((field: { type: string }) => field.type)).toEqual([
    "input",
    "input",
    "input",
    "input",
    "textarea",
    "textarea",
    "input",
    "textarea",
    "textarea",
    "input",
    "textarea",
    "textarea",
  ]);
  expect(fields[0].attributes.placeholder).toBe(
    "Frontend, Extension, or System Preset",
  );
  expect(fields[0].attributes.description).toContain(
    "Frontend, Extension, or System Preset",
  );
  expect(fields[0].validations.required).toBe(true);
  expect(fields[1].validations.required).toBe(true);
  expect(fields[1].attributes.placeholder).toBe(
    "https://github.com/owner/repository or https://codeberg.org/owner/repository",
  );
  expect(fields[2].validations?.required ?? false).toBe(false);
  expect(fields[2].attributes.description).toContain("memory-retrieval");
  expect(fields[5].attributes.description).toContain(
    "comma- or newline-separated",
  );
  expect(fields[4].attributes.description).toContain(
    "may be adapted into Tavernary's catalog summary",
  );
  expect(fields[3].attributes.description).toContain(
    "GitHub and Codeberg sources",
  );
  expect(fields[4].attributes.description).toContain("external System Presets");
  expect(fields[6].attributes.placeholder).toBe("Yes or No");
  expect(fields[6].validations.required).toBe(true);
  expect(fields[8].validations?.required ?? false).toBe(false);
  expect(fields[8].attributes.description).toContain(
    "one canonical family ID per line",
  );
  expect(fields[10].attributes.description).toContain(
    "one canonical format ID per line",
  );
  expect(submission.body[0].attributes.value).toContain(
    "Use a public project source URL. The Tavernary submission builder provides contextual guidance for each project type.",
  );
  expect(submission.body[0].attributes.value).toContain(
    "Tavernary submission builder",
  );
});

test("public Help forms expose readable prefillable fields before an optional manifest", async () => {
  const expected = {
    "02-project-information.yml": {
      ids: [
        "project",
        "category",
        "report",
        "requested-outcome",
        "evidence",
        "help-manifest",
      ],
      types: ["input", "input", "textarea", "textarea", "textarea", "textarea"],
      required: ["project", "category", "report"],
      categories: [
        "Incorrect or outdated card information",
        "Repository moved, renamed, archived, or disappeared",
        "Duplicate or wrong listing",
        "Unsafe or malicious project",
        "Abusive or inappropriate content",
        "Copyright, trademark, or other rights concern",
        "Something else about this listing",
      ],
    },
    "03-website-bug.yml": {
      ids: [
        "category",
        "page-url",
        "actual-behavior",
        "expected-behavior",
        "reproduction-steps",
        "browser",
        "device",
        "additional-context",
        "help-manifest",
      ],
      types: [
        "input",
        "input",
        "textarea",
        "textarea",
        "textarea",
        "input",
        "input",
        "textarea",
        "textarea",
      ],
      required: [
        "category",
        "page-url",
        "actual-behavior",
        "expected-behavior",
        "reproduction-steps",
      ],
      categories: [
        "Search, filters, or sorting",
        "Navigation or link",
        "Display, layout, or theme",
        "Form submission or GitHub handoff",
        "Kit builder or catalog interaction",
        "Accessibility",
        "Performance or loading",
        "Other website behavior",
      ],
    },
    "04-other.yml": {
      ids: [
        "category",
        "subject",
        "description",
        "relevant-url",
        "help-manifest",
      ],
      types: ["input", "input", "textarea", "input", "textarea"],
      required: ["category", "subject", "description"],
      categories: [
        "Using Tavernary",
        "An existing request",
        "Suggest an improvement",
        "Documentation or policy",
        "Something else",
      ],
    },
    "06-kit-report.yml": {
      ids: [
        "kit-id",
        "share-url",
        "category",
        "affected-project-ids",
        "details",
        "evidence",
        "help-manifest",
      ],
      types: [
        "input",
        "input",
        "input",
        "textarea",
        "textarea",
        "textarea",
        "textarea",
      ],
      required: ["kit-id", "share-url", "category", "details"],
      categories: [
        "Compatibility problem",
        "Unsafe or malicious included project",
        "Abusive or inappropriate content",
        "Broken, removed, or unavailable project",
        "Misleading title or description",
        "Duplicate Kit",
        "Author or attribution concern",
        "Other Kit concern",
      ],
    },
  } as const;

  for (const [file, contract] of Object.entries(expected)) {
    const form = parse(
      await readFile(resolve(templateDirectory, file), "utf8"),
    ) as {
      body: Array<{
        type: string;
        id?: string;
        attributes?: { description?: string };
        validations?: { required?: boolean };
      }>;
    };
    const fields = form.body.filter((field) => field.id);

    expect(fields.map((field) => field.id)).toEqual(contract.ids);
    expect(fields.map((field) => field.type)).toEqual(contract.types);
    expect(
      fields
        .filter((field) => field.validations?.required)
        .map((field) => field.id),
    ).toEqual(contract.required);
    expect(fields.at(-1)).toMatchObject({
      id: "help-manifest",
      type: "textarea",
      validations: { required: false },
    });
    expect(
      fields.find((field) => field.id === "category")?.attributes?.description,
    ).toContain(contract.categories.join("; "));
  }
});

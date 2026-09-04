import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test } from "vitest";
import { parse } from "yaml";

const templateDirectory = resolve(".github/ISSUE_TEMPLATE");
const contracts = {
  "01-project-submission.yml": {
    name: "Submit a project",
    route: "https://tavernary.org/submit/project/",
    manifest: "project-manifest",
    ids: [
      "project-type",
      "project-url",
      "primary-function",
      "description-choice",
      "project-description",
      "tag-choice",
      "tags",
      "supported-frontends",
      "frontend-independent",
      "additional-context",
      "supported-model-families",
      "other-model-family",
      "completion-formats",
      "project-manifest",
    ],
  },
  "02-project-information.yml": {
    name: "Report project information",
    route: "https://tavernary.org/menu/report-project/",
    manifest: "help-manifest",
    ids: [
      "project",
      "category",
      "report",
      "requested-outcome",
      "evidence",
      "help-manifest",
    ],
  },
  "03-website-bug.yml": {
    name: "Report a website bug",
    route: "https://tavernary.org/menu/report-website/",
    manifest: "help-manifest",
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
  },
  "04-other.yml": {
    name: "Other",
    route: "https://tavernary.org/menu/other/",
    manifest: "help-manifest",
    ids: [
      "category",
      "subject",
      "description",
      "relevant-url",
      "help-manifest",
    ],
  },
  "05-kit-submission.yml": {
    name: "Submit or edit a Kit",
    route: "https://tavernary.org/?mode=kits",
    manifest: "manifest",
    ids: ["kit-title", "kit-description", "manifest"],
  },
  "06-kit-report.yml": {
    name: "Report a Kit",
    route: "https://tavernary.org/menu/report-kit/",
    manifest: "help-manifest",
    ids: [
      "kit-id",
      "share-url",
      "category",
      "affected-project-ids",
      "details",
      "evidence",
      "help-manifest",
    ],
  },
  "07-kit-withdrawal.yml": {
    name: "Withdraw a Kit",
    route: "https://tavernary.org/menu/withdraw-kit/",
    manifest: "withdrawal-manifest",
    ids: ["kit-id", "share-url", "confirmation", "withdrawal-manifest"],
  },
  "08-project-owner-request.yml": {
    name: "Update or rename a project listing",
    route: "https://tavernary.org/menu/manage-project/",
    manifest: "owner-request-manifest",
    ids: [
      "request-type",
      "source-id",
      "project-id",
      "repository",
      "proposed-name",
      "proposed-summary",
      "supported-frontends",
      "primary-function",
      "tags",
      "summary-metadata-mode",
      "tag-metadata-mode",
      "model-families",
      "completion-formats",
      "proposed-repository",
      "explanation",
      "delist-confirmation",
      "owner-request-manifest",
    ],
  },
} as const;

type IssueForm = {
  name: string;
  description: string;
  title: string;
  body: Array<{
    type: string;
    id?: string;
    attributes?: {
      value?: string;
      label?: string;
      description?: string;
      placeholder?: string;
    };
    validations?: { required?: boolean };
  }>;
};

async function form(file: keyof typeof contracts) {
  return parse(
    await readFile(resolve(templateDirectory, file), "utf8"),
  ) as IssueForm;
}

test("publishes the ordered public review forms and leaves security private", async () => {
  const files = (await readdir(templateDirectory))
    .filter((file) => file.endsWith(".yml") && file !== "config.yml")
    .sort();
  expect(files).toEqual(Object.keys(contracts));
  const forms = await Promise.all(
    files.map((file) => form(file as keyof typeof contracts)),
  );
  expect(forms.map(({ name }) => name)).toEqual(
    Object.values(contracts).map(({ name }) => name),
  );
  expect(forms.map(({ name }) => name)).toEqual([
    ...new Set(forms.map(({ name }) => name)),
  ]);
  expect(
    forms.some((document) =>
      JSON.stringify(document).includes("/security/advisories/new"),
    ),
  ).toBe(false);
});

test("makes every public Issue Form a Tavernary-first review mirror", async () => {
  for (const [file, contract] of Object.entries(contracts)) {
    const document = await form(file as keyof typeof contracts);
    const fields = document.body.filter((field) => field.id);
    const intro = document.body[0];
    const source = await readFile(resolve(templateDirectory, file), "utf8");

    expect(document.description).toContain("Begin in Tavernary");
    expect(intro.type).toBe("markdown");
    expect(intro.attributes?.value).toContain(
      "Tavernary prepared this review.",
    );
    expect(intro.attributes?.value).toContain(
      "The generated manifest is the automation payload; the readable fields are review-only.",
    );
    expect(intro.attributes?.value).toContain(contract.route);
    expect(fields.map(({ id }) => id)).toEqual(contract.ids);
    expect(fields.some(({ type }) => type === "dropdown")).toBe(false);

    const manifest = fields.find(({ id }) => id === contract.manifest);
    expect(manifest).toMatchObject({
      type: "textarea",
      validations: { required: true },
    });
    for (const field of fields.filter(({ id }) => id !== contract.manifest)) {
      expect(field.validations?.required ?? false).toBe(false);
    }
    expect(source).not.toMatch(
      /fallback|edit (?:the|this) issue|structured fallback/iu,
    );
  }
});

test("keeps every URL-prefilled enum mirror as optional plain text", async () => {
  const project = await form("01-project-submission.yml");
  const owner = await form("08-project-owner-request.yml");
  const fields = [...project.body, ...owner.body];
  for (const id of [
    "project-type",
    "primary-function",
    "description-choice",
    "tag-choice",
    "summary-metadata-mode",
    "tag-metadata-mode",
  ]) {
    expect(fields.find((field) => field.id === id)).toMatchObject({
      id,
      type: "input",
      validations: { required: false },
    });
  }

  const descriptionChoice = project.body.find(
    ({ id }) => id === "description-choice",
  );
  expect(descriptionChoice?.attributes?.description).toContain(
    "Let TavernAI write the description; Write the description myself",
  );
  expect(descriptionChoice?.attributes?.placeholder).toBe(
    "Let TavernAI write the description",
  );
  const tagChoice = project.body.find(({ id }) => id === "tag-choice");
  expect(tagChoice?.attributes?.description).toContain(
    "Let Tavernary select tags; Set tags myself",
  );
  expect(tagChoice?.attributes?.placeholder).toBe("Let Tavernary select tags");
});

test("routes the GitHub issue chooser back to every Tavernary intake", async () => {
  const config = parse(
    await readFile(resolve(templateDirectory, "config.yml"), "utf8"),
  ) as {
    blank_issues_enabled: boolean;
    contact_links: Array<{ name: string; url: string; about: string }>;
  };
  expect(config.blank_issues_enabled).toBe(false);
  expect(config.contact_links.map(({ url }) => url)).toEqual([
    "https://tavernary.org/submit/project/",
    "https://tavernary.org/?mode=kits",
    "https://tavernary.org/menu/manage-project/",
    "https://tavernary.org/menu/",
  ]);
  expect(config.contact_links.map(({ name }) => name)).toEqual([
    "Submit a project in Tavernary",
    "Create or edit a Kit in Tavernary",
    "Update or rename a project listing in Tavernary",
    "Open the Tavernary Menu",
  ]);
  for (const link of config.contact_links) {
    expect(link.name).toEqual(expect.any(String));
    expect(link.name.length).toBeGreaterThan(0);
    expect(link.about).toEqual(expect.any(String));
    expect(link.about.length).toBeGreaterThan(0);
  }
});

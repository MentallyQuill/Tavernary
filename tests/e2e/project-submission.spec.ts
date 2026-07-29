import { access } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

test("exports and renders the project submission builder", async ({ page }) => {
  await access("out/submit/project/index.html");
  await page.goto(sitePath("/submit/project/"));

  await expect(
    page.getByRole("heading", { name: "Submit a project" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Search supported frontends" }),
  ).toHaveCount(0);
  const eligibility = page.getByText(
    "Frontends and Extensions require a public GitHub or Codeberg repository.",
  );
  await expect(eligibility).toBeVisible();
  await expect(page.getByLabel("Primary function")).toHaveCount(0);

  await page.getByLabel("Project Type").selectOption({ label: "Extension" });
  await expect(eligibility).toBeVisible();
  await expect(page.getByLabel("Primary function")).toBeVisible();
  await expect(
    page.getByLabel("Primary function").getByRole("option"),
  ).toHaveCount(7);
  await expect(
    page.getByText(
      "Stores, summarizes, searches, retrieves, or injects conversational knowledge and continuity.",
    ),
  ).toBeVisible();

  await page
    .getByLabel("Project Type")
    .selectOption({ label: "System Preset" });
  await expect(page.getByLabel("Primary function")).toHaveCount(0);
});

test("keeps description prose while removing emoji and linking the policy", async ({
  page,
}) => {
  await page.goto(sitePath("/submit/project/"));

  const description = page.getByLabel("Short Description (optional)");
  await description.fill("This is damn useful 🧭 for ST-QuickReply.");

  await expect(description).toHaveValue(
    "This is damn useful  for ST-QuickReply.",
  );
  await expect(
    page.getByText(
      "Emojis aren't supported in catalog descriptions. The rest of your text has been kept.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Catalog Policy" }),
  ).toHaveAttribute("href", /\/catalog-policy\/?$/u);
});

test("selects multiple current frontends for an Extension", async ({
  page,
}) => {
  await page.goto(sitePath("/submit/project/"));
  await page.getByLabel("Project Type").selectOption({ label: "Extension" });

  await page
    .getByRole("combobox", { name: "Search supported frontends" })
    .fill("Silly");
  await expect(page.getByLabel("SillyTavern")).toBeVisible();
  await expect(page.getByLabel("Lumiverse")).toHaveCount(0);
  await page.getByLabel("SillyTavern").check();
  await page
    .getByRole("combobox", { name: "Search supported frontends" })
    .fill("");
  await page.getByLabel("Lumiverse").check();

  const selected = page.getByLabel("Selected frontends");
  await expect(selected).toContainText("SillyTavern");
  await expect(selected).toContainText("Lumiverse");
  await expect(page.getByText("2 selected")).toBeVisible();
  expect(
    await selected
      .getByRole("button", { name: "Remove SillyTavern" })
      .evaluate((element) => element.getBoundingClientRect().height),
  ).toBeGreaterThanOrEqual(44);
});

test("supports frontend-independent and not-listed submission paths", async ({
  page,
}) => {
  await page.goto(sitePath("/submit/project/"));
  await page
    .getByLabel("Project Type")
    .selectOption({ label: "System Preset" });
  await page.getByLabel("Frontend-independent").check();

  await expect(page.getByText("No frontend selection required.")).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Search supported frontends" }),
  ).toHaveCount(0);

  await page.getByLabel("Frontend-independent").uncheck();
  const frontendSection = page
    .getByRole("heading", { name: "Supported frontends" })
    .locator("..")
    .locator("..");
  await expect(frontendSection.getByText("0 selected")).toBeVisible();
  await page.getByLabel("Other or not listed").check();
  await expect(
    page.getByText(
      "Frontends and Extensions require a public GitHub or Codeberg repository.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "This project will stay blocked until the missing frontend is submitted, reviewed, and merged.",
    ),
  ).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(window, "open", {
      configurable: true,
      value: (url: string | URL) => {
        window.sessionStorage.setItem("tavernary-opened-url", String(url));
        return null;
      },
    });
  });
  await page.getByLabel("Project URL").fill("https://example.com/preset");
  await page.getByLabel("Project Name (required)").fill("Example Preset");
  await page
    .getByLabel("Short Description (required)")
    .fill("A portable roleplay preset.");
  await page.getByLabel("Other frontend name").fill("Future Frontend");
  await page
    .getByLabel("Other frontend URL")
    .fill("https://github.com/example/future-frontend");
  await page.getByLabel("Claude", { exact: true }).check();
  await page.getByLabel("Chat Completion", { exact: true }).check();
  await page.getByRole("button", { name: "Continue to GitHub" }).click();

  const openedUrl = await page.evaluate(() =>
    window.sessionStorage.getItem("tavernary-opened-url"),
  );
  const opened = new URL(openedUrl ?? "");
  expect(JSON.parse(opened.searchParams.get("project-manifest") ?? "")).toEqual(
    expect.objectContaining({
      schema_version: 3,
      project_type: "preset",
      primary_function: "preset",
      preset_compatibility: {
        model_families: { known_ids: ["claude"], other: [] },
        completion_formats: ["chat-completion"],
      },
      frontends: {
        known_ids: [],
        other: [
          {
            name: "Future Frontend",
            url: "https://github.com/example/future-frontend",
          },
        ],
      },
    }),
  );
});

test("opens a reviewable GitHub issue containing the stable manifest", async ({
  page,
}) => {
  await page.goto(sitePath("/submit/project/"));
  await page.evaluate(() => {
    Object.defineProperty(window, "open", {
      configurable: true,
      value: (url: string | URL) => {
        window.sessionStorage.setItem("tavernary-opened-url", String(url));
        return null;
      },
    });
  });

  await page.getByLabel("Project Type").selectOption({ label: "Extension" });
  await page.getByLabel("Primary function").selectOption("interface-workflow");
  await page
    .getByLabel("Project URL")
    .fill("https://codeberg.org/targren/Lumiverse-SwipeScrubber");
  await page.getByLabel("SillyTavern").check();
  await page.getByRole("button", { name: "Continue to GitHub" }).click();

  const openedUrl = await page.evaluate(() =>
    window.sessionStorage.getItem("tavernary-opened-url"),
  );
  expect(openedUrl).not.toBeNull();
  const opened = new URL(openedUrl ?? "");
  expect(opened.hostname).toBe("github.com");
  expect(opened.searchParams.get("template")).toBe("01-project-submission.yml");
  expect(JSON.parse(opened.searchParams.get("project-manifest") ?? "")).toEqual(
    expect.objectContaining({
      schema_version: 3,
      project_type: "extension",
      primary_function: "interface-workflow",
      source_url: "https://codeberg.org/targren/Lumiverse-SwipeScrubber",
      frontends: {
        known_ids: ["sillytavern"],
        other: [],
      },
    }),
  );
});

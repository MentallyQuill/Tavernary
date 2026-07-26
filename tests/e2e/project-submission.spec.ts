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
  await page.getByLabel("Other or not listed").check();
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
      project_type: "preset",
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
  await page
    .getByLabel("Project URL")
    .fill("https://github.com/example/extension");
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
      schema_version: 2,
      project_type: "extension",
      source_url: "https://github.com/example/extension",
      frontends: {
        known_ids: ["sillytavern"],
        other: [],
      },
    }),
  );
});

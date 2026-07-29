import { access } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

const projectId = "mentallyquill-directive";

test("reviews one owner card edit and hands the complete manifest to GitHub", async ({
  page,
}) => {
  await access("out/help/manage-project/index.html");
  await page.goto(sitePath(`/help/manage-project/?project=${projectId}`));
  await page.evaluate(() => {
    Object.defineProperty(window, "open", {
      configurable: true,
      value: (url: string | URL) => {
        window.sessionStorage.setItem("tavernary-opened-url", String(url));
        return window;
      },
    });
  });

  await expect(page.getByLabel("Project", { exact: true })).toHaveValue(
    projectId,
  );
  await page.getByRole("radio", { name: "Edit card details" }).check();
  await page
    .getByLabel("Summary")
    .fill("An owner-authored summary for the Directive listing.");
  await expect(page.getByText("52 / 220")).toBeVisible();
  await page.getByRole("button", { name: "Review request" }).click();

  await expect(
    page.getByText(
      "GitHub will verify either current personal-owner authority or reviewed Tavernary staff authority.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue on GitHub" }).click();

  const openedUrl = await page.evaluate(() =>
    window.sessionStorage.getItem("tavernary-opened-url"),
  );
  const opened = new URL(openedUrl ?? "");
  expect(opened.searchParams.get("template")).toBe(
    "08-project-owner-request.yml",
  );
  expect(opened.searchParams.get("project-id")).toBe(projectId);
  const manifest = JSON.parse(
    opened.searchParams.get("owner-request-manifest") ?? "",
  );
  expect(manifest).toMatchObject({
    request_kind: "project-owner",
    operation: "edit-card",
    project_id: projectId,
    repository_id: 1273112032,
    original: {
      name: "Directive",
      summary: expect.any(String),
    },
    proposed: {
      name: "Directive",
      summary: "An owner-authored summary for the Directive listing.",
    },
  });
  expect(manifest.source_fingerprint).toMatch(/^[a-f0-9]{64}$/u);
});

test("keeps organization listings editable for trusted staff with a report fallback", async ({
  page,
}) => {
  await page.goto(sitePath("/help/manage-project/?project=tavern-rpg-suite"));

  await expect(
    page.getByText(
      /Organization suite listings require a public project report/iu,
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Report this listing instead" }),
  ).toHaveAttribute(
    "href",
    /\/help\/report-project\/?\?project=tavern-rpg-suite$/u,
  );
  await expect(
    page.getByRole("radio", { name: "Edit card details" }),
  ).toBeVisible();
});

test("falls back from an unknown owner project and requires a listed selection", async ({
  page,
}) => {
  await page.goto(sitePath("/help/manage-project/?project=unknown-project"));

  const project = page.getByLabel("Project", { exact: true });
  await expect(project).toHaveValue("");
  await page.getByRole("button", { name: "Review request" }).click();

  await expect(page.locator(".help-error-summary")).toContainText(
    "Select a listed project.",
  );
  await expect(project).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByRole("heading", { name: "Review your public request" }),
  ).toHaveCount(0);
});

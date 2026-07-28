import { access } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

const projectId = "aikohanasaki-aikobots";
const projectUrl = "https://github.com/aikohanasaki/Aikobots";

test("preselects a listed project and hands a correction to GitHub for review", async ({
  page,
}) => {
  await access("out/help/report-project/index.html");
  await page.goto(sitePath(`/help/report-project/?project=${projectId}`));
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
  await page.getByLabel("What is wrong?").selectOption("incorrect-information");
  await page
    .getByLabel("What should Tavernary review?")
    .fill("The displayed project summary needs correction.");
  await page.getByRole("button", { name: "Review request" }).click();

  await expect(
    page.getByRole("heading", { name: "Review your public request" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue on GitHub" }).click();

  const openedUrl = await page.evaluate(() =>
    window.sessionStorage.getItem("tavernary-opened-url"),
  );
  const opened = new URL(openedUrl ?? "");
  expect(opened.searchParams.get("template")).toBe(
    "02-project-information.yml",
  );
  expect(opened.searchParams.get("project")).toBe(`Aikobots — ${projectUrl}`);
  expect(opened.searchParams.get("category")).toBe(
    "Incorrect or outdated card information",
  );
  expect(opened.searchParams.get("report")).toBe(
    "The displayed project summary needs correction.",
  );
  expect(JSON.parse(opened.searchParams.get("help-manifest") ?? "")).toEqual(
    expect.objectContaining({
      request_kind: "project-report",
      payload: expect.objectContaining({
        project_id: projectId,
        canonical_source: projectUrl,
        category: "incorrect-information",
      }),
    }),
  );
});

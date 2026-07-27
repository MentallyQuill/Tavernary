import { expect, test } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

test("explains Tavernary and links to contribution flows", async ({ page }) => {
  await page.goto(sitePath());

  await expect(
    page.getByRole("link", { name: "Submit Project" }),
  ).toHaveAttribute("href", /\/submit\/project\/$/);
  await expect(
    page.getByRole("link", { name: "Help", exact: true }),
  ).toHaveAttribute(
    "href",
    /github\.com\/MentallyQuill\/Tavernary\/issues\/new\/choose/,
  );

  await page.getByRole("link", { name: "About" }).click();
  await expect(
    page.getByRole("heading", { name: "About Tavernary" }),
  ).toBeVisible();
  await expect(
    page.getByText(/does not host, mirror, redistribute, or maintain/i),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Non-GitHub Frontends are reviewed manually and do not receive GitHub-derived activity or popularity metadata/i,
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Submit a project" }),
  ).toHaveAttribute("href", /\/submit\/project\/$/);
  await expect(page.getByRole("link", { name: "Get help" })).toHaveAttribute(
    "href",
    /issues\/new\/choose/,
  );
});

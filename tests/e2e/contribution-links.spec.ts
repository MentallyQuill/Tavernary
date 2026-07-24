import { expect, test } from "@playwright/test";

test("explains Tavernary and links to contribution flows", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("link", { name: "Submit Project" }),
  ).toHaveAttribute(
    "href",
    /github\.com\/MentallyQuill\/Tavernary\/issues\/new\?template=project-submission\.yml/,
  );
  await expect(page.getByRole("link", { name: "Help" })).toHaveAttribute(
    "href",
    /github\.com\/MentallyQuill\/Tavernary\/issues\/new\/choose/,
  );

  await page.getByRole("link", { name: "About" }).click();
  await expect(
    page.getByRole("heading", { name: "About Tavernary" }),
  ).toBeVisible();
  await expect(
    page.getByText(/does not host, mirror, redistribute, or install/i),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Submit a project" }),
  ).toHaveAttribute("href", /issues\/new\?template=project-submission\.yml/);
  await expect(page.getByRole("link", { name: "Get help" })).toHaveAttribute(
    "href",
    /issues\/new\/choose/,
  );
});

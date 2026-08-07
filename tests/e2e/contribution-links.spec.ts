import { expect, test } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

test("explains Tavernary and links to contribution flows", async ({ page }) => {
  await page.goto(sitePath());

  await expect(
    page.getByRole("link", { name: "Submit Project" }),
  ).toHaveAttribute("href", /\/submit\/project\/$/);
  await expect(
    page.getByRole("link", { name: "Help", exact: true }),
  ).toHaveAttribute("href", /\/help\/$/);

  await page.getByRole("link", { name: "About" }).click();
  await expect(
    page.getByRole("heading", { name: "About Tavernary" }),
  ).toBeVisible();
  await expect(
    page.getByText(/does not host, mirror, redistribute, or maintain/i),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Repositories from both providers receive the same activity, community, and attribution treatment/i,
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Submit a project" }),
  ).toHaveAttribute("href", /\/submit\/project\/$/);
  await expect(page.getByRole("link", { name: "Get help" })).toHaveAttribute(
    "href",
    /\/help\/$/,
  );
});

test("keeps responsive header help and utility actions available", async ({
  page,
}) => {
  const siteActions = page.getByRole("navigation", { name: "Site actions" });
  const about = siteActions.getByRole("link", { name: "About" });
  const help = siteActions.getByRole("link", { name: "Help", exact: true });
  const submit = siteActions.getByRole("link", { name: "Submit Project" });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sitePath());
  await expect(about).toBeVisible();
  await expect(help).toBeVisible();
  await expect(submit).toBeVisible();

  await page.setViewportSize({ width: 900, height: 900 });
  await expect(about).toBeVisible();
  await expect(help).toBeVisible();
  await expect(submit).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(about).toBeHidden();
  await expect(help).toBeVisible();
  await expect(submit).toBeVisible();

  const helpBox = await help.boundingBox();
  const submitBox = await submit.boundingBox();
  expect(helpBox).not.toBeNull();
  expect(submitBox).not.toBeNull();
  expect(helpBox!.x + helpBox!.width).toBeLessThanOrEqual(submitBox!.x);
});

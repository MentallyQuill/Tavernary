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

test("links to the transparent support page beside Submit Project", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sitePath());

  const submit = page.getByRole("link", { name: "Submit Project" });
  const support = page.getByRole("link", {
    name: "Support Tavernary on Ko-fi",
  });
  const [submitBox, supportBox] = await Promise.all([
    submit.boundingBox(),
    support.boundingBox(),
  ]);
  expect(submitBox).not.toBeNull();
  expect(supportBox).not.toBeNull();
  expect(supportBox!.x).toBeGreaterThanOrEqual(submitBox!.x + submitBox!.width);
  expect(supportBox!.height).toBe(submitBox!.height);
  await expect(support).toHaveCSS("color", "rgb(22, 16, 8)");
  await expect(submit).toHaveCSS("color", "rgb(22, 16, 8)");

  await support.hover();
  await expect(
    page.getByRole("tooltip", { name: "Support Tavernary on Ko-fi" }),
  ).toBeVisible();

  await support.click();
  await expect(
    page.getByRole("heading", { name: "Support Tavernary", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Contribute through Ko-fi" }),
  ).toHaveCount(0);
  const upkeep = page.locator(".support-target");
  const supportOnKofi = upkeep.getByRole("link", {
    name: "Support on Ko-fi",
  });
  await expect(supportOnKofi).toBeVisible();
  await expect(supportOnKofi).toHaveAttribute(
    "href",
    "https://ko-fi.com/mentallyquill",
  );
  await expect(supportOnKofi).toHaveCSS("color", "rgb(22, 16, 8)");
  const targetHeading = upkeep.getByRole("heading", {
    name: "Monthly operating target",
  });
  const targetValue = upkeep.getByText("$12/month", { exact: true });
  const [targetHeadingBox, targetValueBox, supportOnKofiBox] =
    await Promise.all([
      targetHeading.boundingBox(),
      targetValue.boundingBox(),
      supportOnKofi.boundingBox(),
    ]);
  expect(targetHeadingBox).not.toBeNull();
  expect(targetValueBox).not.toBeNull();
  expect(supportOnKofiBox).not.toBeNull();
  expect(targetValueBox!.x).toBeGreaterThanOrEqual(
    targetHeadingBox!.x + targetHeadingBox!.width,
  );
  expect(supportOnKofiBox!.x).toBeGreaterThanOrEqual(
    targetValueBox!.x + targetValueBox!.width,
  );
  const targetCenterY = targetHeadingBox!.y + targetHeadingBox!.height / 2;
  expect(
    Math.abs(targetValueBox!.y + targetValueBox!.height / 2 - targetCenterY),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(
      supportOnKofiBox!.y + supportOnKofiBox!.height / 2 - targetCenterY,
    ),
  ).toBeLessThanOrEqual(2);
  await expect(upkeep).toHaveCSS("padding-left", "24px");
  await expect(upkeep).toHaveCSS("padding-right", "24px");
  await expect(upkeep).toHaveCSS("border-top-color", "rgb(43, 58, 64)");
  await expect(upkeep).toHaveCSS("border-left-color", "rgb(225, 138, 36)");
  await expect(upkeep).toHaveCSS("border-left-width", "3px");
});

test("does not expose a separate recent-support feed", async ({ page }) => {
  await page.goto(sitePath());
  await expect(page.getByText("Recent support on Ko-fi")).toHaveCount(0);
  await page.goto(sitePath("/support/"));
  await expect(page.getByText("Recent support on Ko-fi")).toHaveCount(0);
});

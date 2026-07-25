import { expect, test } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

async function expectTouchTarget(locator: import("@playwright/test").Locator) {
  const box = await locator.boundingBox();
  expect(box, "touch target must have a bounding box").not.toBeNull();
  expect(box!.width, "touch target width").toBeGreaterThanOrEqual(44);
  expect(box!.height, "touch target height").toBeGreaterThanOrEqual(44);
}

test("mobile Kits builder stays browse-first and retains its draft pill", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(sitePath());
  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Kit workspace" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Create Kit" }).click();
  await page.getByRole("button", { name: "Close Kit workspace" }).click();
  await expect(
    page.getByRole("button", { name: "Open draft with 0 projects" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "All Projects", exact: true }).click();
  for (let count = 1; count <= 3; count += 1) {
    await page
      .getByRole("button", { name: /Add .* to Kit/ })
      .first()
      .click();
    await expect(
      page.getByRole("button", {
        name: `Open draft with ${count} projects`,
      }),
    ).toBeVisible();
  }
  await expect(page.locator(".add-to-kit:disabled")).toHaveCount(3);
  await expectTouchTarget(page.locator(".add-to-kit:disabled").first());
  await page
    .getByRole("button", { name: "Open draft with 3 projects" })
    .click();
  await expect(
    page.getByRole("button", { name: /Move .* up/ }).nth(1),
  ).toBeVisible();
  await expectTouchTarget(
    page.getByRole("button", { name: /Move .* up/ }).nth(1),
  );
  await expectTouchTarget(
    page.getByRole("button", { name: /Move .* down/ }).nth(1),
  );
  await expect(page.getByRole("button", { name: /Drag / })).toHaveCount(0);
  await page
    .getByRole("button", { name: /Move .* up/ })
    .nth(1)
    .click();
  const rows = page.locator(".kit-builder-row");
  const orderBeforeRemove = await rows.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-project-id")),
  );
  const removedName = (await rows.nth(1).locator("strong").textContent())!;
  await rows
    .nth(1)
    .getByRole("button", { name: `Remove ${removedName}` })
    .click();
  await expectTouchTarget(
    page.getByRole("button", { name: `Undo remove ${removedName}` }),
  );
  await page
    .getByRole("button", { name: `Undo remove ${removedName}` })
    .click();
  expect(
    await rows.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-project-id")),
    ),
  ).toEqual(orderBeforeRemove);
  await page.getByRole("button", { name: "Close Kit workspace" }).click();
  await expect(
    page.getByRole("button", { name: "Open draft with 3 projects" }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("mobile Kits controls meet the touch-target and overflow contract", async ({
  page,
}) => {
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(sitePath());
    await page.getByRole("button", { name: "Browse categories" }).click();
    await page.getByRole("button", { name: "Kits", exact: true }).click();

    await expectTouchTarget(page.getByRole("button", { name: "Create Kit" }));
    await expectTouchTarget(page.getByRole("button", { name: "Open filters" }));
    await page.getByRole("button", { name: "Create Kit" }).click();
    await expectTouchTarget(
      page.getByRole("button", { name: "Close Kit workspace" }),
    );
    await expectTouchTarget(page.getByRole("textbox", { name: "Title" }));
    await expectTouchTarget(page.getByRole("textbox", { name: "Description" }));
    await expectTouchTarget(page.getByRole("button", { name: "Submit Kit" }));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .getByRole("dialog", { name: "Kit workspace" })
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
  }
});

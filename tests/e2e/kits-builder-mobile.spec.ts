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
  const rows = page.locator(".kit-builder-row");
  const movedName = (await rows.nth(1).locator("strong").textContent())!;
  const handle = rows.nth(1).getByRole("button", {
    name: `Drag ${movedName} to reorder`,
  });
  await expect(handle).toBeVisible();
  await expectTouchTarget(handle);
  await expectTouchTarget(
    rows.nth(1).getByRole("button", { name: `Remove ${movedName}` }),
  );
  const handleBox = (await handle.boundingBox())!;
  const firstBox = (await rows.nth(0).boundingBox())!;
  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + 2, {
    steps: 4,
  });
  await page.mouse.up();
  await expect(rows.nth(0).locator("strong")).toHaveText(movedName);
  await rows
    .nth(0)
    .getByRole("button", { name: `Remove ${movedName}` })
    .click();
  await expect(
    page.getByRole("button", { name: `Remove ${movedName}` }),
  ).toHaveCount(0);
  await expect(page.getByText("Undo")).toHaveCount(0);
  await page.getByRole("button", { name: "Close Kit workspace" }).click();
  await expect(
    page.getByRole("button", { name: "Open draft with 2 projects" }),
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

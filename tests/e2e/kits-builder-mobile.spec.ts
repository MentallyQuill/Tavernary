import { expect, test } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

async function expectTouchTarget(locator: import("@playwright/test").Locator) {
  const box = await locator.boundingBox();
  expect(box, "touch target must have a bounding box").not.toBeNull();
  expect(box!.width, "touch target width").toBeGreaterThanOrEqual(44);
  expect(box!.height, "touch target height").toBeGreaterThanOrEqual(44);
}

async function longPress(
  page: import("@playwright/test").Page,
  locator: import("@playwright/test").Locator,
) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
}

test("mobile Kits builder stays browse-first and retains its draft pill", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(sitePath());
  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Kit Builder" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Create Kit" }).click();
  await page.getByRole("button", { name: "Close Kit Builder" }).click();
  await expect(
    page.getByRole("button", {
      name: "Open Kit Builder, 0 projects in draft",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "All Projects", exact: true }).click();
  const extensionShells = page
    .locator(".project-card-shell")
    .filter({ has: page.locator(".project-card.kind-extension") });
  await longPress(page, extensionShells.nth(0));
  await extensionShells.nth(1).click();
  await extensionShells.nth(2).click();
  const dock = page.getByRole("region", { name: "3 projects selected" });
  await expectTouchTarget(dock.getByRole("button", { name: "Cancel" }));
  await expectTouchTarget(dock.getByRole("button", { name: "Add to Kit" }));
  await dock.getByRole("button", { name: "Add to Kit" }).click();
  await expect(page.getByRole("dialog", { name: "Kit Builder" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", {
      name: "Open Kit Builder, 3 projects in draft",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Open Kit Builder, 3 projects in draft",
    })
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
  await page.getByRole("button", { name: "Close Kit Builder" }).click();
  await expect(
    page.getByRole("button", {
      name: "Open Kit Builder, 2 projects in draft",
    }),
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
      page.getByRole("button", { name: "Close Kit Builder" }),
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
        .getByRole("dialog", { name: "Kit Builder" })
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
  }
});

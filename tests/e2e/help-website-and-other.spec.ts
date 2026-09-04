import { access } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

async function captureOpenedHelpUrl(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    Object.defineProperty(window, "open", {
      configurable: true,
      value: (url: string | URL) => {
        (window as Window & { openedHelpUrl?: string }).openedHelpUrl =
          String(url);
        return window;
      },
    });
  });
}

test("prepares a website report without collecting browser diagnostics", async ({
  page,
}) => {
  await access("out/menu/report-website/index.html");
  await page.goto(sitePath("/menu/report-website/?from=%2Fmenu%2F"));
  await captureOpenedHelpUrl(page);

  await expect(page.getByLabel("What page has the problem?")).toHaveValue(
    "/menu/",
  );
  await page
    .getByLabel("What kind of website problem is this?")
    .selectOption("accessibility");
  await page
    .getByLabel("What happens instead?")
    .fill("The keyboard focus disappears.");
  await page
    .getByLabel("What should happen?")
    .fill("Keyboard focus remains visible.");
  await page
    .getByLabel("How can the problem be reproduced?")
    .fill("Open Help and press Tab.");
  await page.getByRole("button", { name: "Review request" }).click();
  await page.getByRole("button", { name: "Continue on GitHub" }).click();

  const opened = new URL(
    await page.evaluate(
      () => (window as Window & { openedHelpUrl?: string }).openedHelpUrl ?? "",
    ),
  );
  const manifest = JSON.parse(opened.searchParams.get("help-manifest") ?? "");
  expect(opened.searchParams.get("template")).toBe("03-website-bug.yml");
  expect(manifest).toEqual(
    expect.objectContaining({
      request_kind: "website-bug",
      payload: expect.objectContaining({ page_url: "/menu/" }),
    }),
  );
  expect(manifest.payload).not.toHaveProperty("search");
  expect(manifest.payload).not.toHaveProperty("viewport");
});

test("routes specific requests away from Other Help and prepares the fallback", async ({
  page,
}) => {
  await access("out/menu/other/index.html");
  await page.goto(sitePath("/menu/other/"));
  await captureOpenedHelpUrl(page);

  await expect(
    page.getByRole("link", { name: /submit a new project/i }),
  ).toHaveAttribute("href", sitePath("/submit/project/"));
  await expect(
    page.getByRole("link", { name: /create or manage a kit/i }),
  ).toHaveAttribute("href", sitePath("/?mode=kits"));
  await expect(
    page.getByRole("link", { name: /report it privately/i }),
  ).toHaveAttribute("href", sitePath("/menu/security/"));

  await page
    .getByLabel("What do you need help with?")
    .selectOption("using-tavernary");
  await page.getByLabel("Subject").fill("Need help with Kits");
  await page
    .getByLabel("Description")
    .fill("I need help understanding the Kit builder.");
  await page.getByRole("button", { name: "Review request" }).click();
  await page.getByRole("button", { name: "Continue on GitHub" }).click();

  const opened = new URL(
    await page.evaluate(
      () => (window as Window & { openedHelpUrl?: string }).openedHelpUrl ?? "",
    ),
  );
  expect(opened.searchParams.get("template")).toBe("04-other.yml");
  expect(JSON.parse(opened.searchParams.get("help-manifest") ?? "")).toEqual(
    expect.objectContaining({ request_kind: "other-help" }),
  );
});

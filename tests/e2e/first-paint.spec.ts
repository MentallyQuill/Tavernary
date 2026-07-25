import { expect, test } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

test("uses the Tavernary page color before external CSS loads", async ({
  page,
}) => {
  await page.route("**/*.css", (route) => route.abort());

  await page.goto(sitePath());

  await expect(page.locator("html")).toHaveCSS(
    "background-color",
    "rgb(7, 24, 29)",
  );
});

import { pathToFileURL } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

type VisualProfile = {
  brand: {
    color: string;
    fontSize: string;
    fontWeight: string;
    usesInter: boolean;
  };
  card: {
    backgroundColor: string;
    borderColor: string;
    borderRadius: string;
    minHeight: string;
    padding: string;
  };
  title: {
    fontSize: string;
    fontWeight: string;
    usesInter: boolean;
  };
  footer: {
    borderTopColor: string;
    borderTopStyle: string;
    paddingTop: string;
  };
  license: {
    borderTopWidth: string;
    color: string;
    fontSize: string;
  };
};

async function readProfile(
  page: Page,
  selectors: {
    card: string;
    license: string;
    title: string;
  },
): Promise<VisualProfile> {
  return page.evaluate((profileSelectors) => {
    const style = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) {
        throw new Error(`Missing visual contract selector: ${selector}`);
      }
      return getComputedStyle(element);
    };

    const brand = style(".brand-name");
    const card = style(profileSelectors.card);
    const title = style(profileSelectors.title);
    const footer = style(".card-bottom");
    const license = style(profileSelectors.license);

    return {
      brand: {
        color: brand.color,
        fontSize: brand.fontSize,
        fontWeight: brand.fontWeight,
        usesInter: brand.fontFamily.includes("Inter"),
      },
      card: {
        backgroundColor: card.backgroundColor,
        borderColor: card.borderColor,
        borderRadius: card.borderRadius,
        minHeight: card.minHeight,
        padding: card.padding,
      },
      title: {
        fontSize: title.fontSize,
        fontWeight: title.fontWeight,
        usesInter: title.fontFamily.includes("Inter"),
      },
      footer: {
        borderTopColor: footer.borderTopColor,
        borderTopStyle: footer.borderTopStyle,
        paddingTop: footer.paddingTop,
      },
      license: {
        borderTopWidth: license.borderTopWidth,
        color: license.color,
        fontSize: license.fontSize,
      },
    };
  }, selectors);
}

test("production preserves the approved mockup visual profile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(
    pathToFileURL(
      `${process.cwd()}/docs/reference/mockups/catalog-wall-responsive-v7.html`,
    ).href,
    { waitUntil: "domcontentloaded" },
  );
  const reference = await readProfile(page, {
    card: ".repo-card",
    license: ".license.missing",
    title: ".card-title",
  });

  await page.goto(sitePath());
  const production = await readProfile(page, {
    card: ".project-card",
    license: ".license-missing",
    title: ".project-card h2",
  });

  expect(production).toEqual(reference);
});

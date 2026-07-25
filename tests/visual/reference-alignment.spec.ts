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
  submit: {
    backgroundColor: string;
    borderColor: string;
    borderRadius: string;
    color: string;
    fontSize: string;
    padding: string;
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

type AlignmentProfile = {
  category: Record<string, string | number>;
  workspace: Record<string, string | number>;
  toolbar: Record<string, string | number>;
  metadata: Record<string, string | number>;
  card: Record<string, string | number>;
};

function normalizeColumns(value: string | number): string {
  return typeof value === "string" ? value : String(value);
}

async function readProfile(
  page: Page,
  selectors: {
    card: string;
    license: string;
    submit: string;
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
    const submit = style(profileSelectors.submit);
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
      submit: {
        backgroundColor: submit.backgroundColor,
        borderColor: submit.borderColor,
        borderRadius: submit.borderRadius,
        color: submit.color,
        fontSize: submit.fontSize,
        padding: submit.padding,
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

async function readAlignmentProfile(
  page: Page,
  selectors: {
    category: string;
    categoryActive: string;
    categoryText: string;
    workspace: string;
    filters: string;
    catalog: string;
    sort: string;
    metadataOptions: string;
    metadataChip: string;
    grid: string;
    cardTop: string;
    symbol: string;
    symbolIcon: string;
    kind: string;
  },
): Promise<AlignmentProfile> {
  return page.evaluate((profileSelectors) => {
    const element = (selector: string) => {
      const match = document.querySelector<HTMLElement>(selector);
      if (!match) throw new Error(`Missing alignment selector: ${selector}`);
      return match;
    };
    const profile = (selector: string) => {
      const match = element(selector);
      return { element: match, style: getComputedStyle(match) };
    };

    const category = profile(profileSelectors.category);
    const categoryActive = profile(profileSelectors.categoryActive);
    const categoryText = profile(profileSelectors.categoryText);
    const workspace = profile(profileSelectors.workspace);
    const filters = profile(profileSelectors.filters);
    const catalog = profile(profileSelectors.catalog);
    const toolbar = profile(".catalog-toolbar");
    const sort = profile(profileSelectors.sort);
    const metadataOptions = profile(profileSelectors.metadataOptions);
    const metadataChip = profile(profileSelectors.metadataChip);
    const grid = profile(profileSelectors.grid);
    const cardTop = profile(profileSelectors.cardTop);
    const symbol = profile(profileSelectors.symbol);
    const symbolIcon = profile(profileSelectors.symbolIcon);
    const kind = profile(profileSelectors.kind);

    return {
      category: {
        display: category.style.display,
        height: Math.round(category.element.getBoundingClientRect().height),
        columns: category.style.gridTemplateColumns,
        gap: category.style.gap,
        padding: category.style.padding,
        activeBorderWidth: categoryActive.style.borderTopWidth,
        activeBorderRadius: categoryActive.style.borderRadius,
        activeFontSize: categoryText.style.fontSize,
        activeLineHeight: categoryText.style.lineHeight,
      },
      workspace: {
        columns: workspace.style.gridTemplateColumns,
        filterWidth: Math.round(filters.element.getBoundingClientRect().width),
        filterPadding: filters.style.padding,
        catalogPadding: catalog.style.padding,
      },
      toolbar: {
        minHeight: toolbar.style.minHeight,
        alignItems: toolbar.style.alignItems,
        gap: toolbar.style.gap,
        marginBottom: toolbar.style.marginBottom,
        sortHeight: Math.round(sort.element.getBoundingClientRect().height),
      },
      metadata: {
        optionsDisplay: metadataOptions.style.display,
        optionsGap: metadataOptions.style.gap,
        chipHeight: Math.round(
          metadataChip.element.getBoundingClientRect().height,
        ),
        chipPadding: metadataChip.style.padding,
        chipRadius: metadataChip.style.borderRadius,
        chipFontSize: metadataChip.style.fontSize,
      },
      card: {
        columns: grid.style.gridTemplateColumns,
        gap: grid.style.gap,
        topMinHeight: cardTop.style.minHeight,
        symbolWidth: Math.round(symbol.element.getBoundingClientRect().width),
        symbolHeight: Math.round(symbol.element.getBoundingClientRect().height),
        symbolBorderWidth: symbol.style.borderTopWidth,
        symbolRadius: symbol.style.borderRadius,
        symbolBackground: symbol.style.backgroundColor,
        iconWidth: Math.round(symbolIcon.element.getBoundingClientRect().width),
        iconHeight: Math.round(
          symbolIcon.element.getBoundingClientRect().height,
        ),
        kindFontSize: kind.style.fontSize,
        kindLineHeight: kind.style.lineHeight,
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
    submit: ".submit",
    title: ".card-title",
  });

  await page.goto(sitePath());
  const production = await readProfile(page, {
    card: ".project-card",
    license: ".license-missing",
    submit: ".submit-link",
    title: ".project-card h2",
  });

  reference.submit.backgroundColor = "rgb(225, 138, 36)";
  reference.submit.color = "rgb(7, 24, 29)";
  expect(production).toEqual(reference);
});

test("production preserves the approved mockup layout profile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(
    pathToFileURL(
      `${process.cwd()}/docs/reference/mockups/catalog-wall-responsive-v7.html`,
    ).href,
    { waitUntil: "domcontentloaded" },
  );
  const reference = await readAlignmentProfile(page, {
    category: ".category-strip",
    categoryActive: ".category.active",
    categoryText: ".category.active span:last-child",
    workspace: ".workspace",
    filters: ".filters",
    catalog: ".catalog",
    sort: ".sort",
    metadataOptions: ".metadata-options",
    metadataChip: ".metadata-filter-chip",
    grid: ".tile-grid",
    cardTop: ".card-top",
    symbol: ".function-symbol",
    symbolIcon: ".function-symbol .icon",
    kind: ".kind",
  });

  await page.goto(sitePath());
  const production = await readAlignmentProfile(page, {
    category: ".category-navigation",
    categoryActive: ".category-navigation button.active",
    categoryText: ".category-navigation button.active > span",
    workspace: ".catalog-layout",
    filters: ".filter-panel",
    catalog: ".catalog-main",
    sort: ".sort-projects",
    metadataOptions: ".metadata-options",
    metadataChip: ".metadata-filter-chip",
    grid: ".project-grid",
    cardTop: ".card-top",
    symbol: ".function-symbol",
    symbolIcon: ".function-symbol svg",
    kind: ".card-identity",
  });

  const productionCategoryColumns = normalizeColumns(
    production.category.columns,
  );

  expect(productionCategoryColumns.split(" ")).toHaveLength(11);
  reference.category.columns = productionCategoryColumns;
  reference.workspace.columns = production.workspace.columns;
  reference.card.columns = production.card.columns;
  expect(production).toEqual(reference);
});

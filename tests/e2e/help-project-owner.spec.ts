import { readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import {
  copiedGitHubManifest,
  installGitHubReviewRecorder,
  openedGitHubReviews,
  setGitHubReviewsBlocked,
} from "../helpers/github-review";
import { sitePath } from "../helpers/site-path";

const projectId = "mentallyquill-directive";
const frontendVocabulary = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "data/vocabularies/frontends.json"),
    "utf8",
  ),
) as { frontends: Array<{ label: string }> };

test("reviews one owner card edit and hands the complete manifest to GitHub", async ({
  page,
}) => {
  await access("out/help/manage-project/index.html");
  await page.goto(sitePath(`/help/manage-project/?project=${projectId}`));
  await page.evaluate(() => {
    Object.defineProperty(window, "open", {
      configurable: true,
      value: (url: string | URL) => {
        window.sessionStorage.setItem("tavernary-opened-url", String(url));
        return window;
      },
    });
  });

  await expect(page.getByLabel("Project", { exact: true })).toHaveValue(
    "Directive",
  );
  await page.getByRole("radio", { name: "Edit card details" }).check();
  await page.getByLabel("Summary policy").selectOption("manual");
  await page
    .getByRole("textbox", { name: "Summary", exact: true })
    .fill("An owner-authored summary for the Directive listing.");
  await expect(page.getByText("52 / 220")).toBeVisible();
  await page.getByRole("button", { name: "Review request" }).click();

  await expect(
    page.getByText(
      "GitHub checks whether the request is eligible after you continue.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue on GitHub" }).click();

  const openedUrl = await page.evaluate(() =>
    window.sessionStorage.getItem("tavernary-opened-url"),
  );
  const opened = new URL(openedUrl ?? "");
  expect(opened.searchParams.get("template")).toBe(
    "08-project-owner-request.yml",
  );
  expect(opened.searchParams.get("project-id")).toBe(projectId);
  const manifest = JSON.parse(
    opened.searchParams.get("owner-request-manifest") ?? "",
  );
  expect(manifest).toMatchObject({
    schema_version: 2,
    request_kind: "project-owner",
    operation: "edit-card",
    source_id: "github-1273112032",
    project_id: projectId,
    repository_id: 1273112032,
    original: {
      name: "Directive",
      summary: expect.any(String),
    },
    proposed: {
      name: "Directive",
      summary: "An owner-authored summary for the Directive listing.",
      metadata: {
        summary: { mode: "manual" },
        tags: { mode: "automatic" },
      },
    },
  });
  expect(manifest.project_fingerprint).toMatch(/^[a-f0-9]{64}$/u);
});

test("keeps owner wording while removing emoji and linking the policy", async ({
  page,
}) => {
  await page.goto(sitePath(`/help/manage-project/?project=${projectId}`));
  await page.getByRole("radio", { name: "Edit card details" }).check();
  await page.getByLabel("Summary policy").selectOption("manual");

  const summary = page.getByRole("textbox", {
    name: "Summary",
    exact: true,
  });
  await summary.fill("This is damn useful 🧭 for ST-QuickReply.");

  await expect(summary).toHaveValue("This is damn useful  for ST-QuickReply.");
  await expect(
    page.getByText(
      "Emojis aren't supported in catalog descriptions. The rest of your text has been kept.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Catalog Policy" }),
  ).toHaveAttribute("href", /\/catalog-policy\/?$/u);
});

test("keeps every current frontend inside the owner grid as vocabulary grows", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 320, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(sitePath(`/help/manage-project/?project=${projectId}`));
    await page.getByRole("radio", { name: "Edit card details" }).check();

    const group = page.getByRole("group", { name: "Supported frontends" });
    const choices = group.locator(":scope > .help-choice");
    await expect(choices).toHaveCount(frontendVocabulary.frontends.length);
    for (const { label } of frontendVocabulary.frontends) {
      await expect(group.getByLabel(label, { exact: true })).toBeVisible();
    }

    const layout = await group.evaluate((element) => {
      const groupRect = element.getBoundingClientRect();
      const outside = [...element.querySelectorAll(":scope > .help-choice")]
        .map((choice) => choice.getBoundingClientRect())
        .filter(
          (rect) =>
            rect.left < groupRect.left || rect.right > groupRect.right + 0.5,
        ).length;
      return {
        outside,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });

    expect(layout.outside).toBe(0);
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
    expect(layout.pageOverflow).toBeLessThanOrEqual(0);
  }
});

test("requires the typed repository before handing off a permanent source delist", async ({
  page,
}) => {
  await page.goto(sitePath(`/help/manage-project/?project=${projectId}`));
  await page.evaluate(() => {
    Object.defineProperty(window, "open", {
      configurable: true,
      value: (url: string | URL) => {
        window.sessionStorage.setItem("tavernary-opened-url", String(url));
        return window;
      },
    });
  });

  await page
    .getByRole("radio", { name: "Permanently delist this source" })
    .check();
  await page.getByRole("button", { name: "Review request" }).click();

  await expect(
    page.getByRole("heading", {
      name: "Permanently delist MentallyQuill/Directive?",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Adding, editing, retiring, and restoring individual cards are normal maintenance. Delisting the source is not reversible.",
    ),
  ).toBeVisible();
  const confirmation = page.getByLabel(
    "Type MentallyQuill/Directive to confirm permanent delisting.",
  );
  const delist = page.getByRole("button", {
    name: "Permanently delist source",
  });
  await confirmation.fill("MentallyQuill");
  await expect(delist).toBeDisabled();
  await confirmation.fill("MentallyQuill/Directive");
  await expect(delist).toBeEnabled();
  await expect(
    page.getByText("Repository matches. Permanent delisting is now available."),
  ).toBeVisible();
  await delist.click();

  await expect(
    page.getByText(
      "This permanently delists MentallyQuill/Directive and every card from that source.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue on GitHub" }).click();

  const openedUrl = await page.evaluate(() =>
    window.sessionStorage.getItem("tavernary-opened-url"),
  );
  const opened = new URL(openedUrl ?? "");
  expect(
    JSON.parse(opened.searchParams.get("owner-request-manifest") ?? ""),
  ).toMatchObject({
    operation: "delist-source",
    source_id: "github-1273112032",
    delist_confirmation: "MentallyQuill/Directive",
  });
});

test("offers maintenance and owner help for non-GitHub listings", async ({
  page,
}) => {
  await page.goto(sitePath("/help/manage-project/?project=tavern-rpg-suite"));

  await expect(
    page.getByText(/Only GitHub repository listings/iu),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Request a listing review" }),
  ).toHaveAttribute(
    "href",
    /\/help\/report-project\/?\?project=tavern-rpg-suite$/u,
  );
  await expect(
    page.getByRole("radio", { name: "Edit card details" }),
  ).toHaveCount(1);
});

test("reviews an atomic add-card request with independent automatic metadata", async ({
  page,
}) => {
  await page.goto(sitePath(`/help/manage-project/?project=${projectId}`));
  await page.evaluate(() => {
    Object.defineProperty(window, "open", {
      configurable: true,
      value: (url: string | URL) => {
        window.sessionStorage.setItem("tavernary-opened-url", String(url));
        return window;
      },
    });
  });

  await page.getByRole("radio", { name: "Add cards from this source" }).check();
  await expect(
    page.getByText(/Only one unresolved add-card request/iu),
  ).toBeVisible();
  await page.getByLabel("Card 1 display name").fill("Directive Preset");
  await expect(page.getByLabel("Card 1 summary policy")).toHaveValue(
    "automatic",
  );
  await expect(page.getByLabel("Card 1 tag policy")).toHaveValue("automatic");
  await page.getByRole("button", { name: "Review request" }).click();
  await page.getByRole("button", { name: "Continue on GitHub" }).click();

  const openedUrl = await page.evaluate(() =>
    window.sessionStorage.getItem("tavernary-opened-url"),
  );
  const opened = new URL(openedUrl ?? "");
  expect(
    JSON.parse(opened.searchParams.get("owner-request-manifest") ?? ""),
  ).toMatchObject({
    schema_version: 2,
    operation: "add-cards",
    source_id: "github-1273112032",
    proposed_cards: [
      {
        name: "Directive Preset",
        metadata: {
          summary: { mode: "automatic" },
          tags: { mode: "automatic" },
        },
      },
    ],
  });
});

test("keeps a ten-card owner batch usable at 320px through popup recovery", async ({
  page,
}) => {
  await installGitHubReviewRecorder(page, { blocked: true });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(sitePath(`/help/manage-project/?project=${projectId}`));
  await page.getByRole("radio", { name: "Add cards from this source" }).check();

  await page.getByLabel("Card 1 display name").fill("Alpha Card 1");
  for (let index = 2; index <= 10; index += 1) {
    await page.getByRole("button", { name: "Add another card" }).click();
    await page
      .getByLabel(`Card ${index} display name`)
      .fill(`Alpha Card ${index}`);
  }
  await page.getByRole("button", { name: "Review request" }).click();
  await expect(page.getByText("Card 10: Alpha Card 10")).toBeVisible();
  const continueReview = page.getByRole("button", {
    name: "Continue on GitHub",
  });
  await continueReview.scrollIntoViewIfNeeded();
  await expect(continueReview).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(0);
  await continueReview.click();
  await expect(
    page.getByRole("link", { name: "Open prepared GitHub review" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Back and edit" }).click();
  for (let index = 1; index <= 10; index += 1) {
    await expect(page.getByLabel(`Card ${index} display name`)).toHaveValue(
      `Alpha Card ${index}`,
    );
  }
  await setGitHubReviewsBlocked(page, false);
  await page.getByRole("button", { name: "Review request" }).click();
  await page.getByRole("button", { name: "Continue on GitHub" }).click();
  await expect(
    page.getByText(/GitHub review opened in a new tab/u),
  ).toBeVisible();

  const reviews = await openedGitHubReviews(page);
  expect(reviews).toHaveLength(2);
  expect(
    new URL(reviews[1]!).searchParams.get("owner-request-manifest"),
  ).toContain("Paste the copied owner-request manifest");
  const manifest = JSON.parse((await copiedGitHubManifest(page)) ?? "");
  expect(manifest.operation).toBe("add-cards");
  expect(manifest.proposed_cards).toHaveLength(10);
  expect(manifest.proposed_cards.at(-1)?.name).toBe("Alpha Card 10");
});

test("falls back from an unknown owner project and requires a listed selection", async ({
  page,
}) => {
  await page.goto(sitePath("/help/manage-project/?project=unknown-project"));

  const project = page.getByLabel("Project", { exact: true });
  await expect(project).toHaveValue("");
  await page.getByRole("button", { name: "Review request" }).click();

  await expect(page.locator(".help-error-summary")).toContainText(
    "Select a listed project.",
  );
  await expect(project).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByRole("heading", { name: "Review your public request" }),
  ).toHaveCount(0);
});

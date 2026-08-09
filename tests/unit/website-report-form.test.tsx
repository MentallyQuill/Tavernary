import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { WebsiteReportForm } from "@/features/help/components/website-report-form";

let search = "";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

function renderWebsiteForm() {
  return render(<WebsiteReportForm siteRevision="abc123" />);
}

async function completeWebsiteReport(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(
    screen.getByLabelText("What kind of website problem is this?"),
    "accessibility",
  );
  await user.type(
    screen.getByLabelText("What page has the problem?"),
    "/help/",
  );
  await user.type(
    screen.getByLabelText("What happens instead?"),
    "The keyboard focus disappears.",
  );
  await user.type(
    screen.getByLabelText("What should happen?"),
    "Keyboard focus remains visible.",
  );
  await user.type(
    screen.getByLabelText("How can the problem be reproduced?"),
    "Open Help and press Tab.",
  );
  await user.click(screen.getByRole("button", { name: "Review request" }));
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  search = "";
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/help/report-website/");
});

test("routes feature ideas away from website bugs", () => {
  renderWebsiteForm();

  expect(
    screen.getByRole("link", { name: /suggest an improvement/i }),
  ).toHaveAttribute("href", "/help/other");
});

test("accepts only safe local website context from the query", () => {
  search = "from=https%3A%2F%2Ftavernary.org%2Fcatalog%2F";
  renderWebsiteForm();

  expect(screen.getByLabelText("What page has the problem?")).toHaveValue(
    "/catalog/",
  );

  cleanup();
  search = "from=https%3A%2F%2Fevil.example%2Fcatalog%2F";
  renderWebsiteForm();

  expect(screen.getByLabelText("What page has the problem?")).toHaveValue("");
});

test("normalizes query context to a path-only Tavernary route", () => {
  search = "from=%2Fcatalog%3Fsearch%3Dprivate%23details";
  renderWebsiteForm();

  expect(screen.getByLabelText("What page has the problem?")).toHaveValue(
    "/catalog",
  );

  cleanup();
  search = "from=%2F%5Cevil.example";
  renderWebsiteForm();

  expect(screen.getByLabelText("What page has the problem?")).toHaveValue("");

  cleanup();
  search = "from=https%3A%2F%2Ftavernary.org%3A444%2Fcatalog%2F";
  renderWebsiteForm();

  expect(screen.getByLabelText("What page has the problem?")).toHaveValue("");
});

test("associates a website category error with its select", async () => {
  const user = userEvent.setup();
  renderWebsiteForm();

  await user.click(screen.getByRole("button", { name: "Review request" }));

  const category = screen.getByLabelText(
    "What kind of website problem is this?",
  );
  expect(category).toHaveAttribute("aria-invalid", "true");
  expect(category).toHaveAttribute(
    "aria-describedby",
    "website-category-error",
  );
  expect(document.getElementById("website-category-error")).toHaveTextContent(
    "Choose what kind of website problem this is.",
  );
});

test("retains website diagnostics and regenerates only current approved values", async () => {
  const user = userEvent.setup();
  const open = vi.spyOn(window, "open").mockReturnValue(window);
  renderWebsiteForm();

  await completeWebsiteReport(user);
  await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));

  const opened = new URL(open.mock.calls[0]?.[0] as string);
  const manifest = JSON.parse(opened.searchParams.get("help-manifest") ?? "");
  expect(opened.searchParams.get("template")).toBe("03-website-bug.yml");
  expect(opened.searchParams.get("category")).toBe("Accessibility");
  expect(manifest).toEqual(
    expect.objectContaining({
      request_kind: "website-bug",
      origin: {
        page_url: "/help/report-website/",
        site_revision: "abc123",
      },
      payload: expect.objectContaining({
        category: "accessibility",
        page_url: "/help/",
        browser: null,
        device: null,
      }),
    }),
  );
  expect(manifest.payload).not.toHaveProperty("search");
  expect(manifest.payload).not.toHaveProperty("viewport");

  await user.click(
    await screen.findByRole("button", { name: "Back and edit" }),
  );
  const actual = screen.getByLabelText("What happens instead?");
  expect(actual).toHaveValue("The keyboard focus disappears.");
  await user.clear(actual);
  await user.type(actual, "The focus ring is clipped.");
  await user.click(screen.getByRole("button", { name: "Review request" }));
  await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));

  const reopened = new URL(open.mock.calls[1]?.[0] as string);
  expect(
    JSON.parse(reopened.searchParams.get("help-manifest") ?? ""),
  ).toMatchObject({
    payload: {
      category: "accessibility",
      page_url: "/help/",
      actual_behavior: "The focus ring is clipped.",
      expected_behavior: "Keyboard focus remains visible.",
    },
  });
});

test("keeps security reporting on the private route", () => {
  renderWebsiteForm();

  expect(
    screen.getByRole("link", { name: /report it privately/i }),
  ).toHaveAttribute("href", "/help/security");
});

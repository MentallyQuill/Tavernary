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
    screen.getByLabelText("How can we reproduce it?"),
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
    "https://tavernary.org/catalog/",
  );

  cleanup();
  search = "from=https%3A%2F%2Fevil.example%2Fcatalog%2F";
  renderWebsiteForm();

  expect(screen.getByLabelText("What page has the problem?")).toHaveValue("");
});

test("serializes only approved website diagnostics", async () => {
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
});

test("keeps security reporting on the private route", () => {
  renderWebsiteForm();

  expect(
    screen.getByRole("link", { name: /report it privately/i }),
  ).toHaveAttribute("href", "/help/security");
});
